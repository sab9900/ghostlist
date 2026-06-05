using System.Threading;
using System.Threading.Tasks;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Common.Interfaces;

public interface IApplicationDbContext
{
    DbSet<Domain.Entities.GhostList> GhostLists { get; }
    DbSet<GhostListItem> GhostListItems { get; }
    DbSet<GhostChatMessage> GhostChatMessages { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Bulk-deletes all checked GhostListItems whose TTL has expired.
    /// Implemented in Infrastructure using a single SQL DELETE … USING join
    /// to avoid loading entities into memory.
    /// </summary>
    Task<int> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken);
}