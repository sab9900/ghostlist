using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.MarkMessagesRead;

public record MarkMessagesReadCommand(Guid ListId, string DeviceId, List<Guid> MessageIds, string? UserId = null) : IRequest;

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

        var messages = await context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId && request.MessageIds.Contains(m.Id))
            .Select(m => new { m.Id, m.CreatedAt })
            .ToListAsync(cancellationToken);

        if (messages.Count == 0)
            return;

        var newestMarkedAt = new DateTimeOffset(messages.Max(m => m.CreatedAt), TimeSpan.Zero);
        var advanced = false;

        if (member.LastReadMessageAt is null || newestMarkedAt > member.LastReadMessageAt)
        {
            member.LastReadMessageAt = newestMarkedAt;
            advanced = true;
        }

        await context.SaveChangesAsync(cancellationToken);

        var messageIds = messages.Select(m => m.Id).ToList();
        var alreadyReadSet = await context.MessageReadReceipts
            .Where(r => messageIds.Contains(r.MessageId) && (request.UserId != null
                ? r.UserId == request.UserId
                : r.DeviceId == request.DeviceId))
            .Select(r => r.MessageId)
            .ToHashSetAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;

        foreach (var message in messages)
        {
            if (alreadyReadSet.Contains(message.Id))
                continue;

            context.MessageReadReceipts.Add(new MessageReadReceipt
            {
                MessageId = message.Id,
                DeviceId = request.DeviceId,
                UserId = request.UserId,
                ReadAt = now
            });
        }

        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("23505") == true || ex.InnerException?.Message.Contains("unique") == true)
        {
        }

        if (advanced)
        {
            await notifier.NotifyReadReceiptUpdated(
                request.ListId,
                new ReadReceiptUpdatedNotification(request.ListId, request.DeviceId, member.LastReadMessageAt));
        }
    }
}
