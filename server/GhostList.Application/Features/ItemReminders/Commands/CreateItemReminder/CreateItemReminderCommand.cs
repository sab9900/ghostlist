using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.ItemReminders.Commands.CreateItemReminder;

public record CreateItemReminderCommand(
    Guid GhostListId,
    Guid ItemId,
    string DeviceId,
    DateTime RemindAt) : IRequest<Guid>;

public class CreateItemReminderCommandHandler(IApplicationDbContext context)
    : IRequestHandler<CreateItemReminderCommand, Guid>
{
    public async Task<Guid> Handle(CreateItemReminderCommand request, CancellationToken cancellationToken)
    {
        var reminder = ItemReminder.Create(
            request.GhostListId,
            request.ItemId,
            request.DeviceId,
            request.RemindAt.ToUniversalTime());

        context.ItemReminders.Add(reminder);
        await context.SaveChangesAsync(cancellationToken);

        return reminder.Id;
    }
}
