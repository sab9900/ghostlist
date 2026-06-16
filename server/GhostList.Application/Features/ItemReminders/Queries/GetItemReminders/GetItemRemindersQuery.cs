using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ItemReminders.Queries.GetItemReminders;

public record ItemReminderDto(Guid Id, Guid ItemId, DateTime RemindAt);

public record GetItemRemindersQuery(Guid GhostListId, string DeviceId)
    : IRequest<IReadOnlyList<ItemReminderDto>>;

public class GetItemRemindersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetItemRemindersQuery, IReadOnlyList<ItemReminderDto>>
{
    public async Task<IReadOnlyList<ItemReminderDto>> Handle(
        GetItemRemindersQuery request, CancellationToken cancellationToken)
    {
        return await context.ItemReminders
            .Where(r => r.GhostListId == request.GhostListId
                     && r.DeviceId   == request.DeviceId
                     && !r.IsAcknowledged)
            .OrderBy(r => r.RemindAt)
            .Select(r => new ItemReminderDto(r.Id, r.ItemId, r.RemindAt))
            .ToListAsync(cancellationToken);
    }
}
