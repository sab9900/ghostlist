using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Commands.SetItemPriority;

public record SetItemPriorityCommand(Guid ItemId, ItemPriority Priority) : IRequest;

public class SetItemPriorityCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<SetItemPriorityCommand>
{
    public async Task Handle(SetItemPriorityCommand request, CancellationToken cancellationToken)
    {
        var item = await context.GhostListItems
            .FirstOrDefaultAsync(i => i.Id == request.ItemId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostListItem), request.ItemId);

        item.SetPriority(request.Priority);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyItemPriorityChanged(item.GhostListId, new ItemPriorityChangedNotification(
            item.Id,
            (int)item.Priority));
    }
}
