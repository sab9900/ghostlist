using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Commands.ToggleGhostListItem;

public record ToggleGhostListItemCommand(Guid ItemId, string? SenderDeviceId = null) : IRequest;

public class ToggleGhostListItemCommandHandler : IRequestHandler<ToggleGhostListItemCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;
    private readonly IPushNotificationService _push;

    public ToggleGhostListItemCommandHandler(
        IApplicationDbContext context,
        IGhostListNotifier notifier,
        IPushNotificationService push)
    {
        _context = context;
        _notifier = notifier;
        _push = push;
    }

    public async Task Handle(ToggleGhostListItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _context.GhostListItems
            .FirstOrDefaultAsync(i => i.Id == request.ItemId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostListItem), request.ItemId);

        item.ToggleChecked();
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyItemToggled(item.GhostListId, new ItemToggledNotification(
            item.Id,
            item.IsChecked,
            item.CheckedAt));

        _ = _push.SendNotificationAsync(item.GhostListId, PushNotificationType.ItemsChanged, request.SenderDeviceId, cancellationToken)
                 .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
    }
}
