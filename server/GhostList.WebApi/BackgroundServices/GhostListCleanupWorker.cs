using GhostList.Application.Features.Charon.Commands.DeleteExpiredCharonDrops;
using GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;
using GhostList.Application.Features.GhostLists.Commands.DeleteStaleLists;
using GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredAudioBlobs;
using GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredImageBlobs;
using GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredVideoBlobs;
using GhostList.Application.Features.ItemReminders.Commands.TriggerDueItemReminders;
using GhostList.Application.Features.ListReminders.Commands.TriggerDueListReminders;
using GhostList.Application.Features.Nemesis.Commands.ExpireSettlements;
using GhostList.Application.Features.Subscriptions.Commands.DeleteStaleDeviceSubscriptions;
using MediatR;

namespace GhostList.WebApi.BackgroundServices;

public class GhostListCleanupWorker(IServiceScopeFactory scopeFactory, ILogger<GhostListCleanupWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan MemberlessCheckInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan StaleTokenCheckInterval = TimeSpan.FromDays(1);

    private DateTime _lastMemberlessCheck = DateTime.MinValue;
    private DateTime _lastStaleTokenCheck = DateTime.MinValue;
    private DateTime _lastSettlementExpiryCheck = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

                var firedReminders = await mediator.Send(new TriggerDueItemRemindersCommand(), stoppingToken);
                if (firedReminders > 0)
                    logger.LogInformation("Reminders: {Count} item reminder(s) sent.", firedReminders);

                var firedListReminders = await mediator.Send(new TriggerDueListRemindersCommand(), stoppingToken);
                if (firedListReminders > 0)
                    logger.LogInformation("Reminders: {Count} list reminder(s) sent.", firedListReminders);

                var expiredItems = await mediator.Send(new DeleteExpiredListItemsCommand(), stoppingToken);
                if (expiredItems > 0)
                    logger.LogInformation("Cleanup: {Count} expired item(s) deleted.", expiredItems);

                var expiredImages = await mediator.Send(new DeleteExpiredImageBlobsCommand(), stoppingToken);
                if (expiredImages > 0)
                    logger.LogInformation("Cleanup: {Count} expired image blob(s) deleted.", expiredImages);

                var expiredAudios = await mediator.Send(new DeleteExpiredAudioBlobsCommand(), stoppingToken);
                if (expiredAudios > 0)
                    logger.LogInformation("Cleanup: {Count} expired audio blob(s) deleted.", expiredAudios);

                var expiredVideos = await mediator.Send(new DeleteExpiredVideoBlobsCommand(), stoppingToken);
                if (expiredVideos > 0)
                    logger.LogInformation("Cleanup: {Count} expired video blob(s) deleted.", expiredVideos);

                var expiredDrops = await mediator.Send(new DeleteExpiredCharonDropsCommand(), stoppingToken);
                if (expiredDrops > 0)
                    logger.LogInformation("Cleanup: {Count} expired Charon drop(s) deleted.", expiredDrops);

                if (DateTime.UtcNow - _lastMemberlessCheck >= MemberlessCheckInterval)
                {
                    _lastMemberlessCheck = DateTime.UtcNow;
                    var memberlessLists = await mediator.Send(new DeleteMemberlessListsCommand(), stoppingToken);
                    if (memberlessLists > 0)
                        logger.LogInformation("Cleanup: {Count} memberless list(s) deleted.", memberlessLists);
                }

                if (DateTime.UtcNow - _lastStaleTokenCheck >= StaleTokenCheckInterval)
                {
                    _lastStaleTokenCheck = DateTime.UtcNow;
                    var staleTokens = await mediator.Send(new DeleteStaleDeviceSubscriptionsCommand(), stoppingToken);
                    if (staleTokens > 0)
                        logger.LogInformation("Cleanup: {Count} stale device subscription(s) deleted.", staleTokens);
                }

                if (DateTime.UtcNow - _lastSettlementExpiryCheck >= StaleTokenCheckInterval)
                {
                    _lastSettlementExpiryCheck = DateTime.UtcNow;
                    await mediator.Send(new ExpireSettlementsCommand(), stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Cleanup failed.");
            }
        }
    }
}
