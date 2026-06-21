using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListReminders.Commands.AcknowledgeListReminder;

public record AcknowledgeListReminderCommand(Guid ReminderId, string DeviceId) : IRequest;

public class AcknowledgeListReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<AcknowledgeListReminderCommand>
{
    public async Task Handle(AcknowledgeListReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = await context.ListReminders
            .FirstOrDefaultAsync(r => r.Id == request.ReminderId && r.DeviceId == request.DeviceId,
                cancellationToken);

        if (reminder is null) return;

        reminder.MarkAcknowledged();
        await context.SaveChangesAsync(cancellationToken);
    }
}
