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

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken);
}
