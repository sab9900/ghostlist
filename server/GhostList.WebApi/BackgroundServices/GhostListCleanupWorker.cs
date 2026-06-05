using GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;
using GhostList.Application.Features.GhostLists.Commands.DeleteStaleLists;
using MediatR;

namespace GhostList.WebApi.BackgroundServices;

public class GhostListCleanupWorker(IServiceScopeFactory scopeFactory, ILogger<GhostListCleanupWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan TickInterval      = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan StaleListInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan StaleListThreshold = TimeSpan.FromDays(90);

    private DateTime _lastStaleCheck = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

                var expiredItems = await mediator.Send(new DeleteExpiredListItemsCommand(), stoppingToken);
                if (expiredItems > 0)
                    logger.LogInformation("Cleanup: {Count} expired item(s) deleted.", expiredItems);

                if (DateTime.UtcNow - _lastStaleCheck >= StaleListInterval)
                {
                    _lastStaleCheck = DateTime.UtcNow;
                    var staleLists = await mediator.Send(
                        new DeleteStaleListsCommand(StaleListThreshold), stoppingToken);
                    if (staleLists > 0)
                        logger.LogInformation("Cleanup: {Count} stale list(s) deleted.", staleLists);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Cleanup failed.");
            }
        }
    }
}
