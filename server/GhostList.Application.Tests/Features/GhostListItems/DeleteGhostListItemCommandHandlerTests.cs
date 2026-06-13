using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostListItems.Commands.DeleteGhostListItem;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostListItems;

public class DeleteGhostListItemCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyItemDeleted(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush() => Substitute.For<IPushNotificationService>();

    [Fact]
    public async Task Handle_ExistingItem_DeletesItem()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new DeleteGhostListItemCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new DeleteGhostListItemCommand(item.Id), CancellationToken.None);

        (await context.GhostListItems.AnyAsync(i => i.Id == item.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Handle_ExistingItem_NotifiesItemDeleted()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new DeleteGhostListItemCommandHandler(context, notifier, MockPush());
        await handler.Handle(new DeleteGhostListItemCommand(item.Id), CancellationToken.None);

        await notifier.Received(1).NotifyItemDeleted(list.Id, item.Id);
    }

    [Fact]
    public async Task Handle_NonExistentItem_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new DeleteGhostListItemCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new DeleteGhostListItemCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
