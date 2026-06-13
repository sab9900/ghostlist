using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Commands.DeleteGhostListItem;

public record DeleteGhostListItemCommand(Guid ItemId, string? SenderDeviceId = null) : IRequest;

public class DeleteGhostListItemCommandHandler : IRequestHandler<DeleteGhostListItemCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;
    private readonly IPushNotificationService _push;

    public DeleteGhostListItemCommandHandler(
        IApplicationDbContext context,
        IGhostListNotifier notifier,
        IPushNotificationService push)
    {
        _context = context;
        _notifier = notifier;
        _push = push;
    }

    public async Task Handle(DeleteGhostListItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _context.GhostListItems
            .FirstOrDefaultAsync(i => i.Id == request.ItemId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostListItem), request.ItemId);

        var listId = item.GhostListId;
        var itemId = item.Id;

        _context.GhostListItems.Remove(item);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyItemDeleted(listId, itemId);

        _ = _push.SendNotificationAsync(listId, PushNotificationType.ItemsChanged, request.SenderDeviceId, cancellationToken)
                 .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
    }
}
