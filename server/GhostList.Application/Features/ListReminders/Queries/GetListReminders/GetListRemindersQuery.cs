using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListReminders.Queries.GetListReminders;

public record ListReminderDto(Guid Id, DateTime RemindAt);

public record GetListRemindersQuery(Guid GhostListId, string DeviceId)
    : IRequest<IReadOnlyList<ListReminderDto>>;

public class GetListRemindersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetListRemindersQuery, IReadOnlyList<ListReminderDto>>
{
    public async Task<IReadOnlyList<ListReminderDto>> Handle(
        GetListRemindersQuery request, CancellationToken cancellationToken)
    {
        return await context.ListReminders
            .Where(r => r.GhostListId == request.GhostListId
                     && r.DeviceId == request.DeviceId
                     && !r.IsAcknowledged)
            .OrderBy(r => r.RemindAt)
            .Select(r => new ListReminderDto(r.Id, r.RemindAt))
            .ToListAsync(cancellationToken);
    }
}
