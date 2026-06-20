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
    DbSet<LocaleStat> LocaleStats { get; }
    DbSet<InfoMessage> InfoMessages { get; }
    DbSet<MessageReadReceipt> MessageReadReceipts { get; }
    DbSet<ItemReadReceipt> ItemReadReceipts { get; }
    DbSet<CharonDrop> CharonDrops { get; }
    DbSet<CharonViewReceipt> CharonViewReceipts { get; }
    DbSet<ItemReminder> ItemReminders { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCharonDropsAsync(TimeSpan maxAge, CancellationToken cancellationToken);

    Task IncrementDailyUsageAsync(UsageMetric metric, CancellationToken cancellationToken);

    Task IncrementLocaleStatAsync(string language, string country, int count, CancellationToken cancellationToken);
}
