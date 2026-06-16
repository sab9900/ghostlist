using GhostList.Application.Common.Interfaces;
using GhostList.WebApi.Services;

namespace GhostList.WebApi.BackgroundServices;

public class LocaleStatsFlushWorker(
    ILocaleStatsAggregator aggregator,
    IServiceScopeFactory scopeFactory,
    ILogger<LocaleStatsFlushWorker> logger) : BackgroundService
{
    private static readonly TimeSpan FlushInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(FlushInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await FlushAsync(stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {

        await FlushAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }

    private async Task FlushAsync(CancellationToken cancellationToken)
    {
        var counts = aggregator.Drain();
        if (counts.Count == 0) return;

        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

            foreach (var (key, count) in counts)
            {
                await context.IncrementLocaleStatAsync(key.Language, key.Country, count, cancellationToken);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Failed to flush locale stats.");
        }
    }
}
