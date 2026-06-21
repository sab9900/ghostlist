using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GhostList.Application.Features.ListReminders.Commands.TriggerDueListReminders;

public record TriggerDueListRemindersCommand : IRequest<int>;

public class TriggerDueListRemindersCommandHandler(
    IApplicationDbContext context,
    IPushNotificationService push,
    IGhostListNotifier notifier,
    ILogger<TriggerDueListRemindersCommandHandler> logger)
    : IRequestHandler<TriggerDueListRemindersCommand, int>
{
    public async Task<int> Handle(TriggerDueListRemindersCommand request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var due = await context.ListReminders
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
                    PushNotificationType.ListReminder,
                    senderDeviceId: null,
                    cancellationToken,
                    targetDeviceIds: [reminder.DeviceId]);

                await notifier.NotifyListReminderFired(
                    reminder.GhostListId,
                    reminder.Id,
                    reminder.RemindAt,
                    reminder.DeviceId);

                reminder.MarkSent();
                fired++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send ListReminder {ReminderId}", reminder.Id);
            }
        }

        if (fired > 0)
            await context.SaveChangesAsync(cancellationToken);

        return fired;
    }
}
