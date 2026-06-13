using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.GhostListItems.Commands.ToggleGhostListItem;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostListItems;

public class ToggleGhostListItemCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyItemToggled(Arg.Any<Guid>(), Arg.Any<ItemToggledNotification>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush() => Substitute.For<IPushNotificationService>();

    [Fact]
    public async Task Handle_UncheckedItem_SetsCheckedTrue()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new ToggleGhostListItemCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new ToggleGhostListItemCommand(item.Id), CancellationToken.None);

        var updated = await context.GhostListItems.FindAsync(item.Id);
        updated!.IsChecked.Should().BeTrue();
        updated.CheckedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_CheckedItem_SetsCheckedFalse()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        item.ToggleChecked();
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new ToggleGhostListItemCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new ToggleGhostListItemCommand(item.Id), CancellationToken.None);

        var updated = await context.GhostListItems.FindAsync(item.Id);
        updated!.IsChecked.Should().BeFalse();
        updated.CheckedAt.Should().BeNull();
    }

    [Fact]
    public async Task Handle_ValidToggle_NotifiesItemToggled()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ToggleGhostListItemCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ToggleGhostListItemCommand(item.Id), CancellationToken.None);

        await notifier.Received(1).NotifyItemToggled(list.Id, Arg.Any<ItemToggledNotification>());
    }

    [Fact]
    public async Task Handle_NonExistentItem_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new ToggleGhostListItemCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new ToggleGhostListItemCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
