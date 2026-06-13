using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.MarkMessagesRead;

/// <summary>
/// Marks specific chat messages as read by a device, recording a granular
/// per-message read receipt for each id. Only message ids, the device id and
/// a timestamp are stored — no message content — so this stays
/// zero-knowledge compatible.
///
/// If the newest marked message is newer than the device's current
/// <see cref="GhostListMember.LastReadMessageAt"/> rollup, that timestamp is
/// advanced too (it continues to power the simple "seen by others" divider on
/// <see cref="Queries.GetListMembersQuery"/>), and other members are notified.
/// </summary>
public record MarkMessagesReadCommand(Guid ListId, string DeviceId, List<Guid> MessageIds) : IRequest;

public class MarkMessagesReadCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<MarkMessagesReadCommand>
{
    public async Task Handle(MarkMessagesReadCommand request, CancellationToken cancellationToken)
    {
        if (request.MessageIds.Count == 0)
            return;

        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null)
            return;

        // Only consider ids that actually belong to this list.
        var messages = await context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId && request.MessageIds.Contains(m.Id))
            .Select(m => new { m.Id, m.CreatedAt })
            .ToListAsync(cancellationToken);

        if (messages.Count == 0)
            return;

        var alreadyRead = await context.MessageReadReceipts
            .Where(r => r.DeviceId == request.DeviceId)
            .Select(r => r.MessageId)
            .ToListAsync(cancellationToken);

        var alreadyReadSet = alreadyRead.ToHashSet();
        var now = DateTimeOffset.UtcNow;

        foreach (var message in messages)
        {
            if (alreadyReadSet.Contains(message.Id))
                continue;

            context.MessageReadReceipts.Add(new MessageReadReceipt
            {
                MessageId = message.Id,
                DeviceId = request.DeviceId,
                ReadAt = now
            });
        }

        var newestMarkedAt = new DateTimeOffset(messages.Max(m => m.CreatedAt), TimeSpan.Zero);
        var advanced = false;

        if (member.LastReadMessageAt is null || newestMarkedAt > member.LastReadMessageAt)
        {
            member.LastReadMessageAt = newestMarkedAt;
            advanced = true;
        }

        await context.SaveChangesAsync(cancellationToken);

        if (advanced)
        {
            await notifier.NotifyReadReceiptUpdated(
                request.ListId,
                new ReadReceiptUpdatedNotification(request.ListId, request.DeviceId, member.LastReadMessageAt));
        }
    }
}
