using System.Threading.RateLimiting;
using GhostList.Application;
using GhostList.Application.Common.Interfaces;
using GhostList.Infrastructure;
using GhostList.WebApi.BackgroundServices;
using GhostList.WebApi.Hubs;
using GhostList.WebApi.Middleware;
using GhostList.WebApi.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) => Task.CompletedTask);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("DevClient", policy =>
        policy
            .WithOrigins("http://localhost:4200", "http://localhost:4201", "capacitor://localhost", "ionic://localhost", "https://localhost")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());

    options.AddPolicy("AppClient", policy =>
        policy

            .WithOrigins("capacitor://localhost", "ionic://localhost", "https://localhost")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    static string IpKey(HttpContext ctx) =>
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    options.AddPolicy("create-list", ctx =>
        RateLimitPartition.GetSlidingWindowLimiter(IpKey(ctx), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    options.AddPolicy("write-content", ctx =>
        RateLimitPartition.GetSlidingWindowLimiter(IpKey(ctx), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 600,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 12,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    options.AddPolicy("media-upload", ctx =>
        RateLimitPartition.GetSlidingWindowLimiter(IpKey(ctx), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 40,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    options.AddPolicy("share-relay", ctx =>
        RateLimitPartition.GetSlidingWindowLimiter(IpKey(ctx), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));

    options.AddPolicy("read-receipt", ctx =>
        RateLimitPartition.GetSlidingWindowLimiter(IpKey(ctx), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 1200,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 12,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        }));
});

builder.Services.AddRouting(options => options.LowercaseUrls = true);
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructureServices(builder.Configuration);
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddHealthChecks();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 32 * 1024 * 1024;
    options.AddFilter<SignalRRateLimitFilter>();
});
builder.Services.AddSingleton<SignalRRateLimitFilter>();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 35_000_000;
});
builder.Services.AddScoped<IGhostListNotifier, GhostListNotifier>();
builder.Services.AddSingleton<IPresenceTracker, PresenceTracker>();
builder.Services.AddSingleton<IWhisperPresenceTracker, WhisperPresenceTracker>();
builder.Services.AddSingleton<ILocaleStatsAggregator, LocaleStatsAggregator>();
builder.Services.AddHostedService<GhostListCleanupWorker>();
builder.Services.AddHostedService<LocaleStatsFlushWorker>();

var app = builder.Build();

await app.Services.MigrateDatabaseAsync();

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlerMiddleware>();
app.UseMiddleware<AcceptLanguageTrackingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseCors("DevClient");
    app.MapOpenApi();
    app.MapScalarApiReference();
}
else
{
    app.UseCors("AppClient");
}

app.UseRateLimiter();
app.UseAuthorization();

app.UseMiddleware<AdminAuthMiddleware>();
app.UseMiddleware<CiAuthMiddleware>();

app.MapHealthChecks("/health");
app.MapControllers();
app.MapHub<GhostListHub>("/hubs/ghostlist");
app.Run();
