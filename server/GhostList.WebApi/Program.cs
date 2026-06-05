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
            .WithOrigins("http://localhost:4200", "capacitor://localhost", "ionic://localhost")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());

    options.AddPolicy("AppClient", policy =>
        policy
            .WithOrigins("capacitor://localhost", "ionic://localhost")
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
builder.Services.AddSignalR();
builder.Services.AddScoped<IGhostListNotifier, GhostListNotifier>();
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
    app.UseHttpsRedirection();
}

app.UseAuthorization();

app.MapControllers();
app.MapHub<GhostListHub>("/hubs/ghostlist");
app.Run();
