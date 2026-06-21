using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.ListReminders.Commands.CreateListReminder;

public record CreateListReminderCommand(
    Guid GhostListId,
    string DeviceId,
    DateTime RemindAt) : IRequest<Guid>;

public class CreateListReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<CreateListReminderCommand, Guid>
{
    public async Task<Guid> Handle(CreateListReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = ListReminder.Create(
            request.GhostListId,
            request.DeviceId,
            request.RemindAt.ToUniversalTime());

        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync(cancellationToken);

        return reminder.Id;
    }
}
