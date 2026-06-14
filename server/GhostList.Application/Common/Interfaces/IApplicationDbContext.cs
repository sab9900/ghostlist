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
    DbSet<GhostMessageImage> GhostMessageImages { get; }
    DbSet<InfoMessage> InfoMessages { get; }
    DbSet<MessageReadReceipt> MessageReadReceipts { get; }
    DbSet<ItemReadReceipt> ItemReadReceipts { get; }
    DbSet<CharonDrop> CharonDrops { get; }
    DbSet<CharonViewReceipt> CharonViewReceipts { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Deletes stored image blobs older than <paramref name="maxAge"/> and
    /// returns how many rows were removed.
    /// </summary>
    Task<int> DeleteExpiredImageBlobsAsync(TimeSpan maxAge, CancellationToken cancellationToken);

    /// <summary>
    /// Deletes Charon drops older than <paramref name="maxAge"/> that nobody
    /// ever fully viewed, along with their view receipts. Returns the ids and
    /// list ids of the removed drops so callers can broadcast deletions.
    /// </summary>
    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCharonDropsAsync(TimeSpan maxAge, CancellationToken cancellationToken);

    /// <summary>
    /// Atomically bumps today's counter for the given metric in <see cref="DailyUsageStat"/>.
    /// Safe to call from concurrent requests (upsert).
    /// </summary>
    Task IncrementDailyUsageAsync(UsageMetric metric, CancellationToken cancellationToken);
}
