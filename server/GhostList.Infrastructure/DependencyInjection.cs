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
            """);
    }
}
