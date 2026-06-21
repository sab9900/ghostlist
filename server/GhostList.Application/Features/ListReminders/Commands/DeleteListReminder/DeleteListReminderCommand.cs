using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListReminders.Commands.DeleteListReminder;

public record DeleteListReminderCommand(Guid ReminderId, string DeviceId) : IRequest;

public class DeleteListReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteListReminderCommand>
{
    public async Task Handle(DeleteListReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = await context.ListReminders
            .FirstOrDefaultAsync(r => r.Id == request.ReminderId, cancellationToken)
            ?? throw new NotFoundException(nameof(ListReminder), request.ReminderId);

        if (reminder.DeviceId != request.DeviceId)
            throw new ForbiddenException();

        context.ListReminders.Remove(reminder);
        await context.SaveChangesAsync(cancellationToken);
    }
}
