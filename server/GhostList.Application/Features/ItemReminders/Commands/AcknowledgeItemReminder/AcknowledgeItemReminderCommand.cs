using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ItemReminders.Commands.AcknowledgeItemReminder;

public record AcknowledgeItemReminderCommand(Guid ReminderId, string DeviceId) : IRequest;

public class AcknowledgeItemReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<AcknowledgeItemReminderCommand>
{
    public async Task Handle(AcknowledgeItemReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = await context.ItemReminders
            .FirstOrDefaultAsync(r => r.Id == request.ReminderId && r.DeviceId == request.DeviceId,
                cancellationToken);

        if (reminder is null) return; // already gone or wrong device — silently OK

        reminder.MarkAcknowledged();
        await context.SaveChangesAsync(cancellationToken);
    }
}
