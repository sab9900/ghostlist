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
    public DbSet<LocaleStat> LocaleStats => Set<LocaleStat>();
    public DbSet<GhostMessageImage> GhostMessageImages => Set<GhostMessageImage>();
    public DbSet<GhostMessageAudio> GhostMessageAudios => Set<GhostMessageAudio>();
    public DbSet<InfoMessage> InfoMessages => Set<InfoMessage>();
    public DbSet<MessageReadReceipt> MessageReadReceipts => Set<MessageReadReceipt>();
    public DbSet<ItemReadReceipt> ItemReadReceipts => Set<ItemReadReceipt>();
    public DbSet<CharonDrop> CharonDrops => Set<CharonDrop>();
    public DbSet<CharonViewReceipt> CharonViewReceipts => Set<CharonViewReceipt>();
    public DbSet<ItemReminder> ItemReminders => Set<ItemReminder>();

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
            entity.Property(e => e.CheckedByDeviceId).HasMaxLength(64);
            entity.Property(e => e.CheckedByUserId).HasMaxLength(64);
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
            entity.Property(e => e.Locale).HasMaxLength(8);
            entity.Property(e => e.NotifyOnLethe).HasDefaultValue(true);
            entity.Property(e => e.NotifyOnCharon).HasDefaultValue(true);
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

        modelBuilder.Entity<LocaleStat>(entity =>
        {
            entity.HasKey(e => new { e.Date, e.Language, e.Country });
            entity.Property(e => e.Date).HasColumnType("date");
            entity.Property(e => e.Language).HasMaxLength(8);
            entity.Property(e => e.Country).HasMaxLength(2);
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

        modelBuilder.Entity<GhostMessageAudio>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedAudio).IsRequired();
            entity.Property(e => e.AudioInitializationVector).IsRequired();
            entity.HasOne<GhostChatMessage>()
                  .WithOne()
                  .HasForeignKey<GhostMessageAudio>(e => e.Id)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InfoMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Body).IsRequired().HasMaxLength(4000);
            entity.Property(e => e.TargetPlatform).HasConversion<int?>();
            entity.Property(e => e.Version).HasMaxLength(32);
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

        modelBuilder.Entity<CharonDrop>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EncryptedContent).IsRequired();
            entity.Property(e => e.ContentInitializationVector).IsRequired();
            entity.Property(e => e.EncryptedMetadata).IsRequired();
            entity.Property(e => e.MetadataInitializationVector).IsRequired();
            entity.Property(e => e.SenderDeviceId).HasMaxLength(64);
            entity.Property(e => e.SenderUserId).HasMaxLength(64);
            entity.HasIndex(e => e.GhostListId);
            entity.HasOne<Domain.Entities.GhostList>()
                  .WithMany()
                  .HasForeignKey(e => e.GhostListId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CharonViewReceipt>(entity =>
        {
            entity.HasKey(e => new { e.DropId, e.DeviceId });
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            entity.HasOne<CharonDrop>()
                  .WithMany()
                  .HasForeignKey(e => e.DropId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ItemReminder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.DeviceId).HasMaxLength(64).IsRequired();
            // ItemId is intentionally NOT a FK — the item may be deleted before the reminder fires
            entity.HasIndex(e => new { e.IsSent, e.RemindAt });
            entity.HasIndex(e => new { e.IsAcknowledged, e.RemindAt });
            entity.HasOne<Domain.Entities.GhostList>()
                  .WithMany()
                  .HasForeignKey(e => e.GhostListId)
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

    public async Task<int> DeleteExpiredAudioBlobsAsync(TimeSpan maxAge, CancellationToken cancellationToken)
    {
        if (!Database.IsRelational())
        {
            var cutoff = DateTime.UtcNow - maxAge;
            var expired = await GhostMessageAudios
                .Where(a => a.CreatedAt <= cutoff)
                .ToListAsync(cancellationToken);
            if (expired.Count == 0) return 0;
            GhostMessageAudios.RemoveRange(expired);
            await SaveChangesAsync(cancellationToken);
            return expired.Count;
        }

        return await Database.ExecuteSqlInterpolatedAsync(
            $"""
            DELETE FROM "GhostMessageAudios"
            WHERE "CreatedAt" <= NOW() - {maxAge}
            """,
            cancellationToken);
    }

    public async Task<IReadOnlyList<DeletedItemInfo>> DeleteExpiredCharonDropsAsync(TimeSpan maxAge, CancellationToken cancellationToken)
    {
        if (!Database.IsRelational())
        {

            var cutoff = DateTime.UtcNow - maxAge;
            var expired = await CharonDrops
                .Where(d => d.CreatedAt <= cutoff)
                .ToListAsync(cancellationToken);
            if (expired.Count == 0) return [];

            var receipts = await CharonViewReceipts
                .Where(r => expired.Select(d => d.Id).Contains(r.DropId))
                .ToListAsync(cancellationToken);
            CharonViewReceipts.RemoveRange(receipts);
            CharonDrops.RemoveRange(expired);
            await SaveChangesAsync(cancellationToken);

            return expired.Select(d => new DeletedItemInfo(d.Id, d.GhostListId)).ToList();
        }

        return await Database.SqlQueryRaw<DeletedItemInfo>(
            """
            DELETE FROM "CharonDrops"
            WHERE "CreatedAt" <= NOW() - INTERVAL '1 second' * {0}
            RETURNING "Id" AS "ItemId", "GhostListId" AS "ListId"
            """,
            maxAge.TotalSeconds)
            .ToListAsync(cancellationToken);
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

        // column is derived from a closed enum switch with 4 hardcoded string literals — no injection risk.
        // Column names cannot be SQL-parameterized, so ExecuteSqlAsync is not applicable here.
#pragma warning disable EF1002
        await Database.ExecuteSqlRawAsync(
            $"""
            INSERT INTO "DailyUsageStats" ("Date", "ListsCreated", "ItemsCreated", "MessagesCreated", "MembersCreated")
            VALUES (CURRENT_DATE, 0, 0, 0, 0)
            ON CONFLICT ("Date") DO NOTHING;

            UPDATE "DailyUsageStats" SET "{column}" = "{column}" + 1 WHERE "Date" = CURRENT_DATE;
            """,
            cancellationToken);
#pragma warning restore EF1002
    }

    public async Task IncrementLocaleStatAsync(string language, string country, int count, CancellationToken cancellationToken)
    {
        if (count <= 0) return;

        if (!Database.IsRelational())
        {

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var stat = await LocaleStats.FindAsync([today, language, country], cancellationToken);
            if (stat is null)
            {
                stat = new LocaleStat { Date = today, Language = language, Country = country };
                LocaleStats.Add(stat);
            }

            stat.RequestCount += count;
            await SaveChangesAsync(cancellationToken);
            return;
        }

        await Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "LocaleStats" ("Date", "Language", "Country", "RequestCount")
            VALUES (CURRENT_DATE, {language}, {country}, {count})
            ON CONFLICT ("Date", "Language", "Country")
            DO UPDATE SET "RequestCount" = "LocaleStats"."RequestCount" + {count};
            """,
            cancellationToken);
    }
}
