using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Commands.DeleteGhostListItem;

public record DeleteGhostListItemCommand(Guid ItemId) : IRequest;

public class DeleteGhostListItemCommandHandler : IRequestHandler<DeleteGhostListItemCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;

    public DeleteGhostListItemCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(DeleteGhostListItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _context.GhostListItems
            .FirstOrDefaultAsync(i => i.Id == request.ItemId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostListItem), request.ItemId);

        var listId = item.GhostListId;

        _context.GhostListItems.Remove(item);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyItemDeleted(listId, item.Id);
    }
}
