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
    public DbSet<DailyUsageStat> DailyUsageStats => Set<DailyUsageStat>();
    public DbSet<GhostMessageImage> GhostMessageImages => Set<GhostMessageImage>();
    public DbSet<InfoMessage> InfoMessages => Set<InfoMessage>();
    public DbSet<MessageReadReceipt> MessageReadReceipts => Set<MessageReadReceipt>();
    public DbSet<ItemReadReceipt> ItemReadReceipts => Set<ItemReadReceipt>();

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
            entity.Property(e => e.SenderDeviceId).HasMaxLength(64);
            entity.Property(e => e.SenderUserId).HasMaxLength(64);
        });

        modelBuilder.Entity<GhostChatMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedMessage).IsRequired();
            entity.Property(e => e.InitializationVector).IsRequired();
            entity.Property(e => e.EncryptedSenderName).IsRequired();
            entity.Property(e => e.SenderNameInitializationVector).IsRequired();
            entity.Property(e => e.ReplyToMessageId).IsRequired(false);
            entity.Property(e => e.SenderDeviceId).HasMaxLength(64);
            entity.Property(e => e.SenderUserId).HasMaxLength(64);
        });

        modelBuilder.Entity<DeviceSubscription>(entity =>
        {
            entity.HasKey(e => new { e.DeviceId, e.ListId });
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.DeviceToken).HasMaxLength(512).IsRequired();
            entity.Property(e => e.Platform).HasConversion<int>();
            entity.HasIndex(e => e.DeviceToken);
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
            entity.Property(e => e.UserId).HasMaxLength(64);
            entity.Property(e => e.EncryptedPayload).IsRequired();
            entity.Property(e => e.InitializationVector).IsRequired();
            entity.Property(e => e.LastReadMessageAt).IsRequired(false);
            entity.Property(e => e.LastReadItemAt).IsRequired(false);
            entity.HasOne<Domain.Entities.GhostList>()
                  .WithMany()
                  .HasForeignKey(m => m.GhostListId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DailyUsageStat>(entity =>
        {
            entity.HasKey(e => e.Date);
            entity.Property(e => e.Date).HasColumnType("date");
        });

        modelBuilder.Entity<GhostMessageImage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedImage).IsRequired();
            entity.Property(e => e.ImageInitializationVector).IsRequired();
            entity.HasOne<GhostChatMessage>()
                  .WithOne()
                  .HasForeignKey<GhostMessageImage>(e => e.Id)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InfoMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Body).IsRequired().HasMaxLength(4000);
            entity.HasIndex(e => e.CreatedAt);
        });

        modelBuilder.Entity<MessageReadReceipt>(entity =>
        {
            entity.HasKey(e => new { e.MessageId, e.DeviceId });
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            entity.HasOne<GhostChatMessage>()
                  .WithMany()
                  .HasForeignKey(e => e.MessageId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ItemReadReceipt>(entity =>
        {
            entity.HasKey(e => new { e.ItemId, e.DeviceId });
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            entity.HasOne<GhostListItem>()
                  .WithMany()
                  .HasForeignKey(e => e.ItemId)
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

    public async Task<int> DeleteExpiredImageBlobsAsync(TimeSpan maxAge, CancellationToken cancellationToken)
    {
        if (!Database.IsRelational())
        {
            // In-memory provider (used by tests) doesn't support raw SQL.
            var cutoff = DateTime.UtcNow - maxAge;
            var expired = await GhostMessageImages
                .Where(i => i.CreatedAt <= cutoff)
                .ToListAsync(cancellationToken);
            if (expired.Count == 0) return 0;
            GhostMessageImages.RemoveRange(expired);
            await SaveChangesAsync(cancellationToken);
            return expired.Count;
        }

        return await Database.ExecuteSqlInterpolatedAsync(
            $"""
            DELETE FROM "GhostMessageImages"
            WHERE "CreatedAt" <= NOW() - {maxAge}
            """,
            cancellationToken);
    }

    public async Task IncrementDailyUsageAsync(UsageMetric metric, CancellationToken cancellationToken)
    {
        var column = metric switch
        {
            UsageMetric.List => "ListsCreated",
            UsageMetric.Item => "ItemsCreated",
            UsageMetric.Message => "MessagesCreated",
            UsageMetric.Member => "MembersCreated",
            _ => throw new ArgumentOutOfRangeException(nameof(metric), metric, null)
        };

        if (!Database.IsRelational())
        {
            // In-memory provider (used by tests) doesn't support raw SQL.
            // Fall back to a plain EF Core upsert — not atomic, but fine for tests.
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var stat = await DailyUsageStats.FindAsync([today], cancellationToken);
            if (stat is null)
            {
                stat = new DailyUsageStat { Date = today };
                DailyUsageStats.Add(stat);
            }

            switch (metric)
            {
                case UsageMetric.List: stat.ListsCreated++; break;
                case UsageMetric.Item: stat.ItemsCreated++; break;
                case UsageMetric.Message: stat.MessagesCreated++; break;
                case UsageMetric.Member: stat.MembersCreated++; break;
            }

            await SaveChangesAsync(cancellationToken);
            return;
        }

        await Database.ExecuteSqlRawAsync(
            $"""
            INSERT INTO "DailyUsageStats" ("Date", "ListsCreated", "ItemsCreated", "MessagesCreated", "MembersCreated")
            VALUES (CURRENT_DATE, 0, 0, 0, 0)
            ON CONFLICT ("Date") DO NOTHING;

            UPDATE "DailyUsageStats" SET "{column}" = "{column}" + 1 WHERE "Date" = CURRENT_DATE;
            """,
            cancellationToken);
    }
}
