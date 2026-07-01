using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.GhostListItems.Commands.SetItemPriority;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostListItems;

public class SetItemPriorityCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyItemPriorityChanged(Arg.Any<Guid>(), Arg.Any<ItemPriorityChangedNotification>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_SetsItemPriorityToImportant()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new SetItemPriorityCommandHandler(context, MockNotifier());
        await handler.Handle(new SetItemPriorityCommand(item.Id, ItemPriority.Important), CancellationToken.None);

        var updated = await context.GhostListItems.FindAsync(item.Id);
        updated!.Priority.Should().Be(ItemPriority.Important);
    }

    [Fact]
    public async Task Handle_SetsItemPriorityToNone()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        item.SetPriority(ItemPriority.Important);
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new SetItemPriorityCommandHandler(context, MockNotifier());
        await handler.Handle(new SetItemPriorityCommand(item.Id, ItemPriority.None), CancellationToken.None);

        var updated = await context.GhostListItems.FindAsync(item.Id);
        updated!.Priority.Should().Be(ItemPriority.None);
    }

    [Fact]
    public async Task Handle_NotifiesItemPriorityChanged()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new SetItemPriorityCommandHandler(context, notifier);
        await handler.Handle(new SetItemPriorityCommand(item.Id, ItemPriority.Optional), CancellationToken.None);

        await notifier.Received(1).NotifyItemPriorityChanged(list.Id,
            Arg.Is<ItemPriorityChangedNotification>(n => n.ItemId == item.Id && n.Priority == (int)ItemPriority.Optional));
    }

    [Fact]
    public async Task Handle_NonExistentItem_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new SetItemPriorityCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new SetItemPriorityCommand(Guid.NewGuid(), ItemPriority.Important), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
