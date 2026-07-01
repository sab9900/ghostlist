using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.ToggleReaction;

public record ToggleReactionCommand(
    Guid MessageId,
    string? EncryptedEmoji,
    string? EmojiInitializationVector,
    string? EncryptedSenderName,
    string? SenderNameInitializationVector,
    bool RemoveOnly = false,
    string? SenderDeviceId = null,
    string? SenderUserId = null) : IRequest<ToggleReactionResult>;

public record ToggleReactionResult(Guid? ReactionId, bool Removed);

public class ToggleReactionCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<ToggleReactionCommand, ToggleReactionResult>
{
    public async Task<ToggleReactionResult> Handle(ToggleReactionCommand request, CancellationToken cancellationToken)
    {
        var message = await context.GhostChatMessages
            .FirstOrDefaultAsync(m => m.Id == request.MessageId, cancellationToken);

        if (message is null)
            return new ToggleReactionResult(null, false);

        GhostMessageReaction? existing = null;

        if (request.SenderUserId is not null)
        {
            existing = await context.GhostMessageReactions
                .FirstOrDefaultAsync(r => r.MessageId == request.MessageId && r.SenderUserId == request.SenderUserId, cancellationToken);
        }
        else if (request.SenderDeviceId is not null)
        {
            existing = await context.GhostMessageReactions
                .FirstOrDefaultAsync(r => r.MessageId == request.MessageId && r.SenderDeviceId == request.SenderDeviceId && r.SenderUserId == null, cancellationToken);
        }

        if (existing is not null)
        {
            context.GhostMessageReactions.Remove(existing);
            await context.SaveChangesAsync(cancellationToken);

            await notifier.NotifyReactionChanged(message.GhostListId, new ReactionChangedNotification(
                existing.Id,
                message.Id,
                message.GhostListId,
                existing.EncryptedEmoji,
                existing.EmojiInitializationVector,
                existing.EncryptedSenderName,
                existing.SenderNameInitializationVector,
                existing.SenderDeviceId,
                existing.SenderUserId,
                Removed: true));

            if (request.RemoveOnly)
                return new ToggleReactionResult(null, Removed: true);
        }

        if (request.RemoveOnly || request.EncryptedEmoji is null || request.EmojiInitializationVector is null
            || request.EncryptedSenderName is null || request.SenderNameInitializationVector is null)
            return new ToggleReactionResult(null, Removed: existing is not null);

        var reaction = GhostMessageReaction.Create(
            request.MessageId,
            message.GhostListId,
            request.EncryptedEmoji!,
            request.EmojiInitializationVector!,
            request.EncryptedSenderName!,
            request.SenderNameInitializationVector!,
            request.SenderDeviceId,
            request.SenderUserId);

        context.GhostMessageReactions.Add(reaction);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyReactionChanged(message.GhostListId, new ReactionChangedNotification(
            reaction.Id,
            reaction.MessageId,
            reaction.GhostListId,
            reaction.EncryptedEmoji,
            reaction.EmojiInitializationVector,
            reaction.EncryptedSenderName,
            reaction.SenderNameInitializationVector,
            reaction.SenderDeviceId,
            reaction.SenderUserId,
            Removed: false));

        return new ToggleReactionResult(reaction.Id, Removed: false);
    }
}
