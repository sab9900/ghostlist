using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;
using GhostList.Application.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostMessages;

public class CreateGhostChatMessageCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyMessageCreated(Arg.Any<Guid>(), Arg.Any<MessageCreatedNotification>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush() => Substitute.For<IPushNotificationService>();

    private static CreateGhostMessageCommand ValidCommand(Guid listId) => new(
        GhostListId: listId,
        EncryptedMessage: "enc_msg",
        MessageInitializationVector: "msg_iv",
        EncryptedSenderName: "enc_sender",
        SenderNameInitializationVector: "sender_iv");

    [Fact]
    public async Task Handle_ValidCommand_CreatesMessageAndReturnsId()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new CreateGhostChatMessageCommandHandler(context, MockNotifier(), MockPush());
        var id = await handler.Handle(ValidCommand(list.Id), CancellationToken.None);

        id.Should().NotBeEmpty();
        var msg = await context.GhostChatMessages.FindAsync(id);
        msg.Should().NotBeNull();
        msg!.EncryptedMessage.Should().Be("enc_msg");
        msg.GhostListId.Should().Be(list.Id);
    }

    [Fact]
    public async Task Handle_ValidCommand_NotifiesMessageCreated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new CreateGhostChatMessageCommandHandler(context, notifier, MockPush());
        await handler.Handle(ValidCommand(list.Id), CancellationToken.None);

        await notifier.Received(1).NotifyMessageCreated(list.Id, Arg.Any<MessageCreatedNotification>());
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateGhostChatMessageCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(ValidCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_At500Messages_ThrowsInvalidOperationException()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var messages = Enumerable.Range(0, 500)
            .Select(_ => GhostList.Domain.Entities.GhostChatMessage.Create(list.Id, "m", "iv", "s", "siv"));
        context.GhostChatMessages.AddRange(messages);
        await context.SaveChangesAsync();

        var handler = new CreateGhostChatMessageCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(ValidCommand(list.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*500*");
    }

    [Fact]
    public async Task Handle_At499Messages_Succeeds()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var messages = Enumerable.Range(0, 499)
            .Select(_ => GhostList.Domain.Entities.GhostChatMessage.Create(list.Id, "m", "iv", "s", "siv"));
        context.GhostChatMessages.AddRange(messages);
        await context.SaveChangesAsync();

        var handler = new CreateGhostChatMessageCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(ValidCommand(list.Id), CancellationToken.None);

        await act.Should().NotThrowAsync();
        (await context.GhostChatMessages.CountAsync(m => m.GhostListId == list.Id)).Should().Be(500);
    }
}
