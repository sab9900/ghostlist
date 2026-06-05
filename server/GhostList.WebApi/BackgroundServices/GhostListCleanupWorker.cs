using GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;
using MediatR;

namespace GhostList.WebApi.BackgroundServices;

public class GhostListCleanupWorker(IServiceScopeFactory scopeFactory, ILogger<GhostListCleanupWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
                var deleted = await mediator.Send(new DeleteExpiredListItemsCommand(), stoppingToken);

                if (deleted > 0)
                    logger.LogInformation("Cleanup: {Count} expired item(s) deleted.", deleted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Cleanup failed.");
            }
        }
    }
}
