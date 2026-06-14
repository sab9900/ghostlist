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
            // capacitor://localhost = iOS, https://localhost = Android (Capacitor's default androidScheme)
            .WithOrigins("capacitor://localhost", "ionic://localhost", "https://localhost")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

builder.Services.AddRouting(options => options.LowercaseUrls = true);
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructureServices(builder.Configuration);
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddMemoryCache();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 5 * 1024 * 1024;
});
builder.Services.AddScoped<IGhostListNotifier, GhostListNotifier>();
builder.Services.AddSingleton<IPresenceTracker, PresenceTracker>();
builder.Services.AddSingleton<IWhisperPresenceTracker, WhisperPresenceTracker>();
builder.Services.AddHostedService<GhostListCleanupWorker>();

var app = builder.Build();

await app.Services.MigrateDatabaseAsync();

app.UseMiddleware<ExceptionHandlerMiddleware>();

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

app.UseAuthorization();

app.UseMiddleware<AdminAuthMiddleware>();

app.MapControllers();
app.MapHub<GhostListHub>("/hubs/ghostlist");
app.Run();
