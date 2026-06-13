using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Admin.Queries.GetAdminStats;

public record GetAdminStatsQuery(int DaysOfHistory = 30) : IRequest<AdminStatsDto>;

/// <summary>Snapshot of currently-existing rows. Shrinks as the cleanup jobs purge old data.</summary>
public record AdminCurrentCountsDto(int Lists, int Items, int Messages, int Members, int DeviceSubscriptions, int UniqueUsers);

/// <summary>Cumulative counters since tracking started. Never decrease.</summary>
public record AdminTotalCountsDto(long Lists, long Items, long Messages, long Members);

public record AdminDailyStatDto(DateOnly Date, int Lists, int Items, int Messages, int Members);

/// <summary>Derived engagement metrics computed from the current snapshot of data.</summary>
public record AdminEngagementDto(
    double AvgItemsPerList,
    double AvgMembersPerList,
    double ItemCompletionRate,
    double CollaborativeListsShare,
    double PushOptInRate,
    int PlatformIos,
    int PlatformAndroid,
    int PlatformWeb,
    double MultiDeviceUserShare);

public record AdminStatsDto(
    AdminCurrentCountsDto Current,
    AdminTotalCountsDto AllTime,
    List<AdminDailyStatDto> Daily,
    AdminEngagementDto Engagement);

public class GetAdminStatsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminStatsQuery, AdminStatsDto>
{
    public async Task<AdminStatsDto> Handle(GetAdminStatsQuery request, CancellationToken cancellationToken)
    {
        var current = new AdminCurrentCountsDto(
            await context.GhostLists.CountAsync(cancellationToken),
            await context.GhostListItems.CountAsync(cancellationToken),
            await context.GhostChatMessages.CountAsync(cancellationToken),
            await context.GhostListMembers.CountAsync(cancellationToken),
            await context.DeviceSubscriptions.CountAsync(cancellationToken),
            await context.GhostListMembers.Where(m => m.UserId != null).Select(m => m.UserId).Distinct().CountAsync(cancellationToken));

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

        var engagement = await ComputeEngagement(context, current, cancellationToken);

        return new AdminStatsDto(current, allTime, daily, engagement);
    }

    private static async Task<AdminEngagementDto> ComputeEngagement(
        IApplicationDbContext context, AdminCurrentCountsDto current, CancellationToken cancellationToken)
    {
        var avgItemsPerList = current.Lists > 0 ? (double)current.Items / current.Lists : 0;
        var avgMembersPerList = current.Lists > 0 ? (double)current.Members / current.Lists : 0;

        var checkedItems = await context.GhostListItems.CountAsync(i => i.IsChecked, cancellationToken);
        var itemCompletionRate = current.Items > 0 ? (double)checkedItems / current.Items : 0;

        var memberCountsByList = await context.GhostListMembers
            .GroupBy(m => m.GhostListId)
            .Select(g => g.Count())
            .ToListAsync(cancellationToken);
        var listsWithMembers = memberCountsByList.Count;
        var collaborativeLists = memberCountsByList.Count(c => c > 1);
        var collaborativeListsShare = listsWithMembers > 0 ? (double)collaborativeLists / listsWithMembers : 0;

        var optedInSubscriptions = await context.DeviceSubscriptions
            .CountAsync(d => d.NotifyOnMessage || d.NotifyOnItemsChanged, cancellationToken);
        var pushOptInRate = current.DeviceSubscriptions > 0 ? (double)optedInSubscriptions / current.DeviceSubscriptions : 0;

        var platformCounts = await context.DeviceSubscriptions
            .GroupBy(d => d.Platform)
            .Select(g => new { Platform = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var platformIos = platformCounts.FirstOrDefault(p => p.Platform == DevicePlatform.Ios)?.Count ?? 0;
        var platformAndroid = platformCounts.FirstOrDefault(p => p.Platform == DevicePlatform.Android)?.Count ?? 0;
        var platformWeb = platformCounts.FirstOrDefault(p => p.Platform == DevicePlatform.Web)?.Count ?? 0;

        var userDevicePairs = await context.GhostListMembers
            .Where(m => m.UserId != null)
            .Select(m => new { m.UserId, m.DeviceId })
            .Distinct()
            .ToListAsync(cancellationToken);
        var userDeviceCounts = userDevicePairs
            .GroupBy(p => p.UserId)
            .Select(g => g.Select(p => p.DeviceId).Distinct().Count())
            .ToList();
        var totalUsers = userDeviceCounts.Count;
        var multiDeviceUsers = userDeviceCounts.Count(c => c > 1);
        var multiDeviceUserShare = totalUsers > 0 ? (double)multiDeviceUsers / totalUsers : 0;

        return new AdminEngagementDto(
            avgItemsPerList,
            avgMembersPerList,
            itemCompletionRate,
            collaborativeListsShare,
            pushOptInRate,
            platformIos,
            platformAndroid,
            platformWeb,
            multiDeviceUserShare);
    }
}
