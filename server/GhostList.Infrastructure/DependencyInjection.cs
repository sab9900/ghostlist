using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
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

        // Firebase / FCM — optional: only active when service account JSON is configured
        var serviceAccountJson = configuration["Firebase:ServiceAccountJson"];
        if (!string.IsNullOrWhiteSpace(serviceAccountJson) && FirebaseApp.DefaultInstance is null)
        {
            FirebaseApp.Create(new AppOptions
            {
                Credential = GoogleCredential.FromJson(serviceAccountJson),
            });
        }

        services.AddScoped<IPushNotificationService, FcmNotificationService>();

        return services;
    }

    public static async Task MigrateDatabaseAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
    }
}
