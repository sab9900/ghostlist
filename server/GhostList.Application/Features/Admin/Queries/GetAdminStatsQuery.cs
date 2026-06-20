using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Admin.Queries.GetAdminStats;

public record GetAdminStatsQuery(int DaysOfHistory = 30) : IRequest<AdminStatsDto>;

public record AdminCurrentCountsDto(int Lists, int Items, int Messages, int Members, int DeviceSubscriptions, int UniqueUsers, int DistinctDevices);

public record AdminTotalCountsDto(long Lists, long Items, long Messages, long Members);

public record AdminDailyStatDto(DateOnly Date, int Lists, int Items, int Messages, int Members);

public record AdminEngagementDto(
    double AvgItemsPerList,
    double AvgMembersPerList,
    double AvgMembersPerCollaborativeList,
    double CollaborativeListsShare,
    double ProtectedListsShare,
    double PushOptInRate,
    int PlatformIos,
    int PlatformAndroid,
    int PlatformWeb,
    double MultiDeviceUserShare,
    int ActiveLists7d,
    int ActiveLists30d,
    int CharonDropCount,
    int ActiveReminderCount,
    double ReminderSentRate);

public record AdminLanguageStatDto(string Language, long Count, double Share);

public record AdminCountryStatDto(string Country, long Count, double Share);

public record AdminLocaleBreakdownDto(
    List<AdminLanguageStatDto> Languages,
    List<AdminCountryStatDto> Countries,
    double UnknownCountryShare);

public record AdminTtlStatDto(string Label, long Count, double Share);

public record AdminStatsDto(
    AdminCurrentCountsDto Current,
    AdminTotalCountsDto AllTime,
    List<AdminDailyStatDto> Daily,
    AdminEngagementDto Engagement,
    AdminLocaleBreakdownDto LocaleBreakdown,
    List<AdminTtlStatDto> TtlBreakdown);

public class GetAdminStatsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminStatsQuery, AdminStatsDto>
{
    public async Task<AdminStatsDto> Handle(GetAdminStatsQuery request, CancellationToken cancellationToken)
    {
        var distinctDevices = await context.GhostListMembers
            .Select(m => m.DeviceId)
            .Distinct()
            .CountAsync(cancellationToken);

        var current = new AdminCurrentCountsDto(
            await context.GhostLists.CountAsync(cancellationToken),
            await context.GhostListItems.CountAsync(cancellationToken),
            await context.GhostChatMessages.CountAsync(cancellationToken),
            await context.GhostListMembers.CountAsync(cancellationToken),
            await context.DeviceSubscriptions.CountAsync(cancellationToken),
            await context.GhostListMembers.Where(m => m.UserId != null).Select(m => m.UserId).Distinct().CountAsync(cancellationToken),
            distinctDevices);

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
        var localeBreakdown = await ComputeLocaleBreakdown(context, cancellationToken);
        var ttlBreakdown = await ComputeTtlBreakdown(context, cancellationToken);

        return new AdminStatsDto(current, allTime, daily, engagement, localeBreakdown, ttlBreakdown);
    }

    private static async Task<List<AdminTtlStatDto>> ComputeTtlBreakdown(
        IApplicationDbContext context, CancellationToken cancellationToken)
    {
        var totals = await context.GhostLists
            .GroupBy(l => l.CompletedItemsTtl)
            .Select(g => new { Ttl = g.Key, Count = (long)g.Count() })
            .ToListAsync(cancellationToken);

        var total = totals.Sum(t => t.Count);

        return totals
            .OrderByDescending(t => t.Count)
            .Select(t => new AdminTtlStatDto(
                TtlLabel(t.Ttl),
                t.Count,
                total > 0 ? (double)t.Count / total : 0))
            .ToList();
    }

    private static string TtlLabel(DeleteAfterDuration ttl) => ttl switch
    {
        DeleteAfterDuration.Immediately => "Immediately",
        DeleteAfterDuration.OneHour => "1 hour",
        DeleteAfterDuration.SixHours => "6 hours",
        DeleteAfterDuration.TwelveHours => "12 hours",
        DeleteAfterDuration.OneDay => "1 day",
        DeleteAfterDuration.ThreeDays => "3 days",
        DeleteAfterDuration.OneWeek => "1 week",
        DeleteAfterDuration.OneMonth => "1 month",
        DeleteAfterDuration.ThreeMonths => "3 months",
        _ => ttl.ToString()
    };

    private static async Task<AdminLocaleBreakdownDto> ComputeLocaleBreakdown(
        IApplicationDbContext context, CancellationToken cancellationToken)
    {
        var languageTotals = await context.LocaleStats
            .GroupBy(l => l.Language)
            .Select(g => new { Language = g.Key, Count = g.Sum(x => (long)x.RequestCount) })
            .ToListAsync(cancellationToken);

        var totalRequests = languageTotals.Sum(l => l.Count);

        var languages = languageTotals
            .Select(l => new AdminLanguageStatDto(l.Language, l.Count, totalRequests > 0 ? (double)l.Count / totalRequests : 0))
            .OrderByDescending(l => l.Count)
            .ToList();

        var countryTotals = await context.LocaleStats
            .Where(l => l.Country != "")
            .GroupBy(l => l.Country)
            .Select(g => new { Country = g.Key, Count = g.Sum(x => (long)x.RequestCount) })
            .ToListAsync(cancellationToken);

        var knownCountryRequests = countryTotals.Sum(c => c.Count);

        var countries = countryTotals
            .Select(c => new AdminCountryStatDto(c.Country, c.Count, knownCountryRequests > 0 ? (double)c.Count / knownCountryRequests : 0))
            .OrderByDescending(c => c.Count)
            .ToList();

        var unknownCountryShare = totalRequests > 0 ? (double)(totalRequests - knownCountryRequests) / totalRequests : 0;

        return new AdminLocaleBreakdownDto(languages, countries, unknownCountryShare);
    }

    private static async Task<AdminEngagementDto> ComputeEngagement(
        IApplicationDbContext context, AdminCurrentCountsDto current, CancellationToken cancellationToken)
    {
        var avgItemsPerList = current.Lists > 0 ? (double)current.Items / current.Lists : 0;
        var avgMembersPerList = current.Lists > 0 ? (double)current.Members / current.Lists : 0;

        var memberCountsByList = await context.GhostListMembers
            .GroupBy(m => m.GhostListId)
            .Select(g => g.Count())
            .ToListAsync(cancellationToken);
        var listsWithMembers = memberCountsByList.Count;
        var collaborativeCounts = memberCountsByList.Where(c => c > 1).ToList();
        var collaborativeLists = collaborativeCounts.Count;
        var collaborativeListsShare = listsWithMembers > 0 ? (double)collaborativeLists / listsWithMembers : 0;
        var avgMembersPerCollaborativeList = collaborativeLists > 0 ? (double)collaborativeCounts.Sum() / collaborativeLists : 0;

        var protectedLists = await context.GhostLists.CountAsync(l => l.OwnerTokenHash != null, cancellationToken);
        var protectedListsShare = current.Lists > 0 ? (double)protectedLists / current.Lists : 0;

        var optedInSubscriptions = await context.DeviceSubscriptions
            .CountAsync(d => d.NotifyOnMessage || d.NotifyOnItemsChanged || d.NotifyOnLethe || d.NotifyOnCharon, cancellationToken);
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

        var cutoff7d = DateTime.UtcNow.AddDays(-7);
        var cutoff30d = DateTime.UtcNow.AddDays(-30);

        var activeLists7d = await context.GhostLists
            .Where(l => l.CreatedAt >= cutoff7d
                || l.Items.Any(i => i.CreatedAt >= cutoff7d)
                || l.ChatMessages.Any(m => m.CreatedAt >= cutoff7d))
            .CountAsync(cancellationToken);

        var activeLists30d = await context.GhostLists
            .Where(l => l.CreatedAt >= cutoff30d
                || l.Items.Any(i => i.CreatedAt >= cutoff30d)
                || l.ChatMessages.Any(m => m.CreatedAt >= cutoff30d))
            .CountAsync(cancellationToken);

        var charonDropCount = await context.CharonDrops.CountAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var totalReminders = await context.ItemReminders.CountAsync(cancellationToken);
        var sentReminders = await context.ItemReminders.CountAsync(r => r.IsSent, cancellationToken);
        var activeReminderCount = await context.ItemReminders
            .CountAsync(r => !r.IsSent && r.RemindAt >= now, cancellationToken);
        var reminderSentRate = totalReminders > 0 ? (double)sentReminders / totalReminders : 0;

        return new AdminEngagementDto(
            avgItemsPerList,
            avgMembersPerList,
            avgMembersPerCollaborativeList,
            collaborativeListsShare,
            protectedListsShare,
            pushOptInRate,
            platformIos,
            platformAndroid,
            platformWeb,
            multiDeviceUserShare,
            activeLists7d,
            activeLists30d,
            charonDropCount,
            activeReminderCount,
            reminderSentRate);
    }
}
