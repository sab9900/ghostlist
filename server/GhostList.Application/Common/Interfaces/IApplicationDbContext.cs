using System.Threading;
using System.Threading.Tasks;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Common.Interfaces;

public record DeletedItemInfo(Guid ItemId, Guid ListId);

public interface IApplicationDbContext
{
    DbSet<Domain.Entities.GhostList> GhostLists { get; }
    DbSet<GhostListItem> GhostListItems { get; }
    DbSet<GhostChatMessage> GhostChatMessages { get; }
    DbSet<DeviceSubscription> DeviceSubscriptions { get; }
    DbSet<GhostListMember> GhostListMembers { get; }
    DbSet<DailyUsageStat> DailyUsageStats { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Atomically bumps today's counter for the given metric in <see cref="DailyUsageStat"/>.
    /// Safe to call from concurrent requests (upsert).
    /// </summary>
    Task IncrementDailyUsageAsync(UsageMetric metric, CancellationToken cancellationToken);
}
