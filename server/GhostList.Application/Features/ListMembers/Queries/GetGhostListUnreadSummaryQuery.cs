using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Queries;

/// <summary>
/// Computes how many messages/items have arrived since this device last read
/// the list, based on the read-receipt timestamps stored on its member record.
/// Powers unread badges/bubbles without the client needing to fetch full
/// message/item history just to count.
/// </summary>
public record GetGhostListUnreadSummaryQuery(Guid ListId, string DeviceId) : IRequest<UnreadSummaryDto>;

public record UnreadSummaryDto(
    int UnreadMessageCount,
    int UnreadItemCount,
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

        var lastReadMessageAt = member?.LastReadMessageAt;
        var lastReadItemAt = member?.LastReadItemAt;

        var lastReadMessageAtUtc = lastReadMessageAt?.UtcDateTime;
        var lastReadItemAtUtc = lastReadItemAt?.UtcDateTime;

        var unreadMessageCount = await context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId)
            .Where(m => lastReadMessageAtUtc == null || m.CreatedAt > lastReadMessageAtUtc.Value)
            .CountAsync(cancellationToken);

        var unreadItemCount = await context.GhostListItems
            .Where(i => i.GhostListId == request.ListId)
            .Where(i => lastReadItemAtUtc == null || i.CreatedAt > lastReadItemAtUtc.Value)
            .CountAsync(cancellationToken);

        return new UnreadSummaryDto(unreadMessageCount, unreadItemCount, lastReadMessageAt, lastReadItemAt);
    }
}
