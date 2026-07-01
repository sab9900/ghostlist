using GhostList.Application.Common.Interfaces;
using GhostList.Infrastructure.Persistence;
using GhostList.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GhostList.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(connectionString, b => b.MigrationsAssembly("GhostList.Infrastructure")));
        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

        services.Configure<FcmOptions>(configuration.GetSection("Fcm"));
        services.AddScoped<IPushNotificationService, FcmNotificationService>();

        var minioEndpoint = configuration["Minio:Endpoint"];
        if (string.IsNullOrWhiteSpace(minioEndpoint))
        {
            services.AddSingleton<IBlobStorage, InMemoryBlobStorage>();
        }
        else
        {
            services.Configure<MinIOOptions>(configuration.GetSection("Minio"));
            services.AddSingleton<IBlobStorage, MinIOBlobStorage>();
        }

        return services;
    }

    public static async Task MigrateDatabaseAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();

        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "GhostLists"
            ADD COLUMN IF NOT EXISTS "OwnerTokenHash" character varying(64);

            ALTER TABLE "MessageReadReceipts"
            ADD COLUMN IF NOT EXISTS "UserId" character varying(128);

            ALTER TABLE "ItemReadReceipts"
            ADD COLUMN IF NOT EXISTS "UserId" character varying(128);

            ALTER TABLE "CharonViewReceipts"
            ADD COLUMN IF NOT EXISTS "UserId" character varying(128);

            CREATE INDEX IF NOT EXISTS "IX_MessageReadReceipts_MessageId_UserId"
            ON "MessageReadReceipts" ("MessageId", "UserId");

            CREATE INDEX IF NOT EXISTS "IX_ItemReadReceipts_ItemId_UserId"
            ON "ItemReadReceipts" ("ItemId", "UserId");

            CREATE INDEX IF NOT EXISTS "IX_CharonViewReceipts_DropId_UserId"
            ON "CharonViewReceipts" ("DropId", "UserId");

            ALTER TABLE "CharonDrops" DROP COLUMN IF EXISTS "EncryptedContent";
            ALTER TABLE "CharonDrops" DROP COLUMN IF EXISTS "ContentInitializationVector";

            DROP TABLE IF EXISTS "GhostMessageImages";
            DROP TABLE IF EXISTS "GhostMessageAudios";

            ALTER TABLE "GhostListItems"
            ADD COLUMN IF NOT EXISTS "Priority" integer NOT NULL DEFAULT 0;
            """);
    }
}
