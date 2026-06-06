using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;

public record CreateGhostMessageCommand(
    Guid GhostListId,
    string EncryptedMessage,
    string MessageInitializationVector,
    string EncryptedSenderName,
    string SenderNameInitializationVector,
    string? SenderDeviceToken = null) : IRequest<Guid>;

public class CreateGhostChatMessageCommandHandler : IRequestHandler<CreateGhostMessageCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;
    private readonly IPushNotificationService _push;

    public CreateGhostChatMessageCommandHandler(
        IApplicationDbContext context,
        IGhostListNotifier notifier,
        IPushNotificationService push)
    {
        _context = context;
        _notifier = notifier;
        _push = push;
    }

    public async Task<Guid> Handle(CreateGhostMessageCommand request, CancellationToken cancellationToken)
    {
        var ghostList = await _context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.GhostListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.GhostListId);

        var messageCount = await _context.GhostChatMessages
            .CountAsync(m => m.GhostListId == request.GhostListId, cancellationToken);

        if (messageCount >= 500)
            throw new InvalidOperationException("Cannot add more than 500 messages to a ghost list.");

        var newMessage = ghostList.CreateMessage(
            request.EncryptedMessage,
            request.MessageInitializationVector,
            request.EncryptedSenderName,
            request.SenderNameInitializationVector);

        _context.GhostChatMessages.Add(newMessage);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyMessageCreated(newMessage.GhostListId, new MessageCreatedNotification(
            newMessage.Id,
            newMessage.GhostListId,
            newMessage.EncryptedMessage,
            newMessage.InitializationVector,
            newMessage.EncryptedSenderName,
            newMessage.SenderNameInitializationVector,
            newMessage.CreatedAt));

        _ = _push.SendMessageNotificationAsync(newMessage.GhostListId, request.SenderDeviceToken, cancellationToken)
                 .ContinueWith(t => { /* swallow — push is best-effort */ }, TaskContinuationOptions.OnlyOnFaulted);

        return newMessage.Id;
    }
}
