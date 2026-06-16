using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GhostList.Application.Features.ItemReminders.Commands.TriggerDueItemReminders;

public record TriggerDueItemRemindersCommand : IRequest<int>;

public class TriggerDueItemRemindersCommandHandler(
    IApplicationDbContext context,
    IPushNotificationService push,
    IGhostListNotifier notifier,
    ILogger<TriggerDueItemRemindersCommandHandler> logger)
    : IRequestHandler<TriggerDueItemRemindersCommand, int>
{
    public async Task<int> Handle(TriggerDueItemRemindersCommand request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var due = await context.ItemReminders
            .Where(r => !r.IsSent && r.RemindAt <= now)
            .ToListAsync(cancellationToken);

        if (due.Count == 0) return 0;

        var fired = 0;
        foreach (var reminder in due)
        {
            try
            {
                await push.SendNotificationAsync(
                    reminder.GhostListId,
                    PushNotificationType.ItemReminder,
                    senderDeviceId: null,           // never suppress — this is the owner's own reminder
                    cancellationToken,
                    targetDeviceIds: [reminder.DeviceId]);

                // SignalR: fires even when app is in foreground (push may be suppressed by OS)
                await notifier.NotifyReminderFired(
                    reminder.GhostListId,
                    reminder.ItemId,
                    reminder.Id,
                    reminder.DeviceId);

                reminder.MarkSent();
                fired++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send ItemReminder {ReminderId}", reminder.Id);
            }
        }

        if (fired > 0)
            await context.SaveChangesAsync(cancellationToken);

        return fired;
    }
}
