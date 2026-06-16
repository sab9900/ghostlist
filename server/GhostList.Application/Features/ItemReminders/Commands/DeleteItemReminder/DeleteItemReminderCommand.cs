using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ItemReminders.Commands.DeleteItemReminder;

public record DeleteItemReminderCommand(Guid ReminderId, string DeviceId) : IRequest;

public class DeleteItemReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteItemReminderCommand>
{
    public async Task Handle(DeleteItemReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = await context.ItemReminders
            .FirstOrDefaultAsync(r => r.Id == request.ReminderId, cancellationToken)
            ?? throw new NotFoundException(nameof(ItemReminder), request.ReminderId);

        // Only the device that created the reminder may cancel it
        if (reminder.DeviceId != request.DeviceId)
            throw new ForbiddenException();

        context.ItemReminders.Remove(reminder);
        await context.SaveChangesAsync(cancellationToken);
    }
}
