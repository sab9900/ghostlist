using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.GhostListItems.Commands.CreateGhostListItem;
using GhostList.Application.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostListItems;

public class CreateGhostListItemCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyItemCreated(Arg.Any<Guid>(), Arg.Any<ItemCreatedNotification>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush() => Substitute.For<IPushNotificationService>();

    [Fact]
    public async Task Handle_ValidCommand_CreatesItemAndReturnsId()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new CreateGhostListItemCommandHandler(context, MockNotifier(), MockPush());
        var cmd = new CreateGhostListItemCommand(list.Id, "enc_payload", "iv");

        var id = await handler.Handle(cmd, CancellationToken.None);

        id.Should().NotBeEmpty();
        var item = await context.GhostListItems.FindAsync(id);
        item.Should().NotBeNull();
        item!.EncryptedPayload.Should().Be("enc_payload");
        item.GhostListId.Should().Be(list.Id);
    }

    [Fact]
    public async Task Handle_ValidCommand_NotifiesItemCreated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new CreateGhostListItemCommandHandler(context, notifier, MockPush());

        await handler.Handle(new CreateGhostListItemCommand(list.Id, "payload", "iv"), CancellationToken.None);

        await notifier.Received(1).NotifyItemCreated(list.Id, Arg.Any<ItemCreatedNotification>());
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateGhostListItemCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(
            new CreateGhostListItemCommand(Guid.NewGuid(), "payload", "iv"),
            CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_At500Items_ThrowsInvalidOperationException()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var items = Enumerable.Range(0, 500)
            .Select(_ => GhostList.Domain.Entities.GhostListItem.Create(list.Id, "p", "iv"));
        context.GhostListItems.AddRange(items);
        await context.SaveChangesAsync();

        var handler = new CreateGhostListItemCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(
            new CreateGhostListItemCommand(list.Id, "one_more", "iv"),
            CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*500*");
    }

    [Fact]
    public async Task Handle_At499Items_Succeeds()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var items = Enumerable.Range(0, 499)
            .Select(_ => GhostList.Domain.Entities.GhostListItem.Create(list.Id, "p", "iv"));
        context.GhostListItems.AddRange(items);
        await context.SaveChangesAsync();

        var handler = new CreateGhostListItemCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(
            new CreateGhostListItemCommand(list.Id, "the_500th", "iv"),
            CancellationToken.None);

        await act.Should().NotThrowAsync();
        (await context.GhostListItems.CountAsync(i => i.GhostListId == list.Id)).Should().Be(500);
    }
}
