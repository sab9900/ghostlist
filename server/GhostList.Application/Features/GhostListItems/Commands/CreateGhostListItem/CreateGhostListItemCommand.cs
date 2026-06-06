using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Commands.CreateGhostListItem;

public record CreateGhostListItemCommand(
    Guid GhostListId,
    string EncryptedPayload,
    string InitializationVector,
    string? SenderDeviceToken = null) : IRequest<Guid>;

public class CreateGhostListItemCommandHandler : IRequestHandler<CreateGhostListItemCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;
    private readonly IPushNotificationService _push;

    public CreateGhostListItemCommandHandler(
        IApplicationDbContext context,
        IGhostListNotifier notifier,
        IPushNotificationService push)
    {
        _context = context;
        _notifier = notifier;
        _push = push;
    }

    public async Task<Guid> Handle(CreateGhostListItemCommand request, CancellationToken cancellationToken)
    {
        var ghostList = await _context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.GhostListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.GhostListId);

        var itemCount = await _context.GhostListItems
            .CountAsync(i => i.GhostListId == request.GhostListId, cancellationToken);

        if (itemCount >= 500)
            throw new InvalidOperationException("Cannot add more than 500 items to a ghost list.");

        var newItem = ghostList.CreateListItem(request.EncryptedPayload, request.InitializationVector);
        _context.GhostListItems.Add(newItem);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyItemCreated(newItem.GhostListId, new ItemCreatedNotification(
            newItem.Id,
            newItem.GhostListId,
            newItem.EncryptedPayload,
            newItem.InitializationVector,
            newItem.IsChecked,
            newItem.CreatedAt));

        _ = _push.SendItemNotificationAsync(newItem.GhostListId, request.SenderDeviceToken, cancellationToken)
                 .ContinueWith(t => { /* swallow — push is best-effort */ }, TaskContinuationOptions.OnlyOnFaulted);

        return newItem.Id;
    }
}
