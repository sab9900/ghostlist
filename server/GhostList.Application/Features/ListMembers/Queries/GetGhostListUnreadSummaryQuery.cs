using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Queries;

public record GetGhostListUnreadSummaryQuery(Guid ListId, string DeviceId, string? UserId = null) : IRequest<UnreadSummaryDto>;

public record UnreadSummaryDto(
    int UnreadMessageCount,
    int UnreadItemCount,
    List<Guid> UnreadMessageIds,
    List<Guid> UnreadItemIds,
    DateTimeOffset? LastReadMessageAt,
    DateTimeOffset? LastReadItemAt);

public class GetGhostListUnreadSummaryQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostListUnreadSummaryQuery, UnreadSummaryDto>
{
    public async Task<UnreadSummaryDto> Handle(GetGhostListUnreadSummaryQuery request, CancellationToken cancellationToken)
    {
        var member = await context.GhostListMembers
            .Where(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId)
            .Select(m => new { m.LastReadMessageAt, m.LastReadItemAt })
            .FirstOrDefaultAsync(cancellationToken);

        var candidateMessageIds = await context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId)
            .Where(m => !(
                (m.SenderDeviceId != null && m.SenderDeviceId == request.DeviceId)
                || (request.UserId != null && m.SenderUserId != null && m.SenderUserId == request.UserId)))
            .Select(m => m.Id)
            .ToListAsync(cancellationToken);

        var candidateItemIds = await context.GhostListItems
            .Where(i => i.GhostListId == request.ListId)
            .Where(i => !(
                (i.SenderDeviceId != null && i.SenderDeviceId == request.DeviceId)
                || (request.UserId != null && i.SenderUserId != null && i.SenderUserId == request.UserId)))
            .Select(i => i.Id)
            .ToListAsync(cancellationToken);

        var readMessageIds = (await context.MessageReadReceipts
            .Where(r => request.UserId != null
                ? r.UserId == request.UserId
                : r.DeviceId == request.DeviceId)
            .Select(r => r.MessageId)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var readItemIds = (await context.ItemReadReceipts
            .Where(r => request.UserId != null
                ? r.UserId == request.UserId
                : r.DeviceId == request.DeviceId)
            .Select(r => r.ItemId)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        var unreadMessageIds = candidateMessageIds.Where(id => !readMessageIds.Contains(id)).ToList();
        var unreadItemIds = candidateItemIds.Where(id => !readItemIds.Contains(id)).ToList();

        return new UnreadSummaryDto(
            unreadMessageIds.Count,
            unreadItemIds.Count,
            unreadMessageIds,
            unreadItemIds,
            member?.LastReadMessageAt,
            member?.LastReadItemAt);
    }
}
