using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Admin.Queries.GetAdminStats;

public record GetAdminStatsQuery(int DaysOfHistory = 30) : IRequest<AdminStatsDto>;

/// <summary>Snapshot of currently-existing rows. Shrinks as the cleanup jobs purge old data.</summary>
public record AdminCurrentCountsDto(int Lists, int Items, int Messages, int Members, int DeviceSubscriptions);

/// <summary>Cumulative counters since tracking started. Never decrease.</summary>
public record AdminTotalCountsDto(long Lists, long Items, long Messages, long Members);

public record AdminDailyStatDto(DateOnly Date, int Lists, int Items, int Messages, int Members);

public record AdminStatsDto(
    AdminCurrentCountsDto Current,
    AdminTotalCountsDto AllTime,
    List<AdminDailyStatDto> Daily);

public class GetAdminStatsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminStatsQuery, AdminStatsDto>
{
    public async Task<AdminStatsDto> Handle(GetAdminStatsQuery request, CancellationToken cancellationToken)
    {
        var current = new AdminCurrentCountsDto(
            await context.GhostLists.CountAsync(cancellationToken),
            await context.GhostListItems.CountAsync(cancellationToken),
            await context.GhostChatMessages.CountAsync(cancellationToken),
            await context.GhostListMembers.CountAsync(cancellationToken),
            await context.DeviceSubscriptions.CountAsync(cancellationToken));

        var allTime = await context.DailyUsageStats
            .GroupBy(_ => 1)
            .Select(g => new AdminTotalCountsDto(
                g.Sum(d => (long)d.ListsCreated),
                g.Sum(d => (long)d.ItemsCreated),
                g.Sum(d => (long)d.MessagesCreated),
                g.Sum(d => (long)d.MembersCreated)))
            .FirstOrDefaultAsync(cancellationToken)
            ?? new AdminTotalCountsDto(0, 0, 0, 0);

        var days = Math.Clamp(request.DaysOfHistory, 1, 365);
        var startDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-(days - 1));

        var rows = await context.DailyUsageStats
            .Where(d => d.Date >= startDate)
            .ToListAsync(cancellationToken);

        var byDate = rows.ToDictionary(r => r.Date);

        var daily = new List<AdminDailyStatDto>(days);
        for (var i = 0; i < days; i++)
        {
            var date = startDate.AddDays(i);
            daily.Add(byDate.TryGetValue(date, out var row)
                ? new AdminDailyStatDto(date, row.ListsCreated, row.ItemsCreated, row.MessagesCreated, row.MembersCreated)
                : new AdminDailyStatDto(date, 0, 0, 0, 0));
        }

        return new AdminStatsDto(current, allTime, daily);
    }
}
