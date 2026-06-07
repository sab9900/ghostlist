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
    public DbSet<DeviceSubscription> DeviceSubscriptions => Set<DeviceSubscription>();
    public DbSet<GhostListMember> GhostListMembers => Set<GhostListMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Domain.Entities.GhostList>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.CompletedItemsTtl).HasConversion<int>();
            entity.Property(e => e.OwnerTokenHash).HasMaxLength(64);
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

        modelBuilder.Entity<DeviceSubscription>(entity =>
        {
            entity.HasKey(e => new { e.DeviceToken, e.ListId });
            entity.Property(e => e.DeviceToken).HasMaxLength(512).IsRequired();
            entity.HasOne<Domain.Entities.GhostList>()
                  .WithMany()
                  .HasForeignKey(s => s.ListId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GhostListMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.GhostListId, e.DeviceId }).IsUnique();
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.EncryptedPayload).IsRequired();
            entity.Property(e => e.InitializationVector).IsRequired();
            entity.HasOne<Domain.Entities.GhostList>()
                  .WithMany()
                  .HasForeignKey(m => m.GhostListId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }

    public async Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCheckedItemsAsync(CancellationToken cancellationToken)
    {
        return await Database.SqlQueryRaw<DeletedItemInfo>(
            """
            DELETE FROM "GhostListItems" i
            USING "GhostLists" gl
            WHERE i."GhostListId" = gl."Id"
              AND i."IsChecked"   = true
              AND i."CheckedAt"  IS NOT NULL
              AND i."CheckedAt"  <= NOW() - (gl."CompletedItemsTtl" * INTERVAL '1 hour')
            RETURNING i."Id" AS "ItemId", i."GhostListId" AS "ListId"
            """)
            .ToListAsync(cancellationToken);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => base.SaveChangesAsync(cancellationToken);
}
