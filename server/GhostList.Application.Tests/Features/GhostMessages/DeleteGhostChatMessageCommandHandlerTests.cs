using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Commands.DeleteGhostChatMessage;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostMessages;

public class DeleteGhostChatMessageCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyMessageDeleted(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ExistingMessage_DeletesMessage()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var msg = GhostChatMessage.Create(list.Id, "enc_msg", "iv", "sender", "siv");
        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(msg);
        await context.SaveChangesAsync();

        var handler = new DeleteGhostChatMessageCommandHandler(context, MockNotifier());
        await handler.Handle(new DeleteGhostChatMessageCommand(msg.Id), CancellationToken.None);

        (await context.GhostChatMessages.AnyAsync(m => m.Id == msg.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Handle_ExistingMessage_NotifiesMessageDeleted()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var msg = GhostChatMessage.Create(list.Id, "enc_msg", "iv", "sender", "siv");
        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(msg);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new DeleteGhostChatMessageCommandHandler(context, notifier);
        await handler.Handle(new DeleteGhostChatMessageCommand(msg.Id), CancellationToken.None);

        await notifier.Received(1).NotifyMessageDeleted(list.Id, msg.Id);
    }

    [Fact]
    public async Task Handle_NonExistentMessage_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new DeleteGhostChatMessageCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new DeleteGhostChatMessageCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
