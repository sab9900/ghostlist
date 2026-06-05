using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<Domain.Entities.GhostList> GhostLists => Set<Domain.Entities.GhostList>();
    public DbSet<GhostListItem> GhostListItems => Set<GhostListItem>();
    public DbSet<GhostChatMessage> GhostChatMessages => Set<GhostChatMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Domain.Entities.GhostList>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.CompletedItemsTtl).HasConversion<int>();
            entity.HasMany(e => e.Items)
                  .WithOne()
                  .HasForeignKey(i => i.GhostListId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.ChatMessages)
                  .WithOne()
                  .HasForeignKey(m => m.GhostListId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GhostListItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedPayload).IsRequired();
            entity.Property(e => e.InitializationVector).IsRequired();
        });

        modelBuilder.Entity<GhostChatMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedMessage).IsRequired();
            entity.Property(e => e.InitializationVector).IsRequired();
            entity.Property(e => e.EncryptedSenderName).IsRequired();
            entity.Property(e => e.SenderNameInitializationVector).IsRequired();
        });
    }

    /// <inheritdoc />
    public async Task<int> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken)
    {
        // Single DELETE … USING query — no entities loaded into memory.
        // PostgreSQL interval syntax: CompletedItemsTtl holds hours as integer.
        return await Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "GhostListItems" i
            USING "GhostLists" gl
            WHERE i."GhostListId" = gl."Id"
              AND i."IsChecked"   = true
              AND i."CheckedAt"  IS NOT NULL
              AND i."CheckedAt"  <= NOW() - (gl."CompletedItemsTtl" * INTERVAL '1 hour')
            """,
            cancellationToken);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => base.SaveChangesAsync(cancellationToken);
}
