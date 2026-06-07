using GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;
using GhostList.Application.Features.GhostLists.Commands.DeleteStaleLists;
using MediatR;

namespace GhostList.WebApi.BackgroundServices;

public class GhostListCleanupWorker(IServiceScopeFactory scopeFactory, ILogger<GhostListCleanupWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan TickInterval          = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan MemberlessCheckInterval = TimeSpan.FromHours(1);

    private DateTime _lastMemberlessCheck = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

                // Every tick: remove expired checked items.
                var expiredItems = await mediator.Send(new DeleteExpiredListItemsCommand(), stoppingToken);
                if (expiredItems > 0)
                    logger.LogInformation("Cleanup: {Count} expired item(s) deleted.", expiredItems);

                // Every hour: remove lists that have no members left.
                if (DateTime.UtcNow - _lastMemberlessCheck >= MemberlessCheckInterval)
                {
                    _lastMemberlessCheck = DateTime.UtcNow;
                    var memberlessLists = await mediator.Send(new DeleteMemberlessListsCommand(), stoppingToken);
                    if (memberlessLists > 0)
                        logger.LogInformation("Cleanup: {Count} memberless list(s) deleted.", memberlessLists);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Cleanup failed.");
            }
        }
    }
}
