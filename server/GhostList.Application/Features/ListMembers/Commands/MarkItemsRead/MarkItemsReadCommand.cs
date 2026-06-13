using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.MarkItemsRead;

/// <summary>
/// Marks specific list items as read (seen) by a device, recording a granular
/// per-item read receipt for each id. Only item ids, the device id and a
/// timestamp are stored — no item content — so this stays zero-knowledge
/// compatible.
///
/// If the newest marked item is newer than the device's current
/// <see cref="GhostListMember.LastReadItemAt"/> rollup, that timestamp is
/// advanced too.
/// </summary>
public record MarkItemsReadCommand(Guid ListId, string DeviceId, List<Guid> ItemIds) : IRequest;

public class MarkItemsReadCommandHandler(IApplicationDbContext context)
    : IRequestHandler<MarkItemsReadCommand>
{
    public async Task Handle(MarkItemsReadCommand request, CancellationToken cancellationToken)
    {
        if (request.ItemIds.Count == 0)
            return;

        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null)
            return;

        // Only consider ids that actually belong to this list.
        var items = await context.GhostListItems
            .Where(i => i.GhostListId == request.ListId && request.ItemIds.Contains(i.Id))
            .Select(i => new { i.Id, i.CreatedAt })
            .ToListAsync(cancellationToken);

        if (items.Count == 0)
            return;

        var alreadyRead = await context.ItemReadReceipts
            .Where(r => r.DeviceId == request.DeviceId)
            .Select(r => r.ItemId)
            .ToListAsync(cancellationToken);

        var alreadyReadSet = alreadyRead.ToHashSet();
        var now = DateTimeOffset.UtcNow;

        foreach (var item in items)
        {
            if (alreadyReadSet.Contains(item.Id))
                continue;

            context.ItemReadReceipts.Add(new ItemReadReceipt
            {
                ItemId = item.Id,
                DeviceId = request.DeviceId,
                ReadAt = now
            });
        }

        var newestMarkedAt = new DateTimeOffset(items.Max(i => i.CreatedAt), TimeSpan.Zero);

        if (member.LastReadItemAt is null || newestMarkedAt > member.LastReadItemAt)
        {
            member.LastReadItemAt = newestMarkedAt;
        }

        await context.SaveChangesAsync(cancellationToken);
    }
}
