using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.DeleteCharonDrop;

/// <summary>
/// Manually retracts a Charon drop (e.g. the sender changed their mind)
/// before everyone has viewed it. Removes the drop and any view receipts
/// and broadcasts <c>CharonDropDeleted</c>.
/// </summary>
public record DeleteCharonDropCommand(Guid DropId) : IRequest;

public class DeleteCharonDropCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<DeleteCharonDropCommand>
{
    public async Task Handle(DeleteCharonDropCommand request, CancellationToken cancellationToken)
    {
        var drop = await context.CharonDrops
            .FirstOrDefaultAsync(d => d.Id == request.DropId, cancellationToken)
            ?? throw new NotFoundException(nameof(CharonDrop), request.DropId);

        var receipts = await context.CharonViewReceipts
            .Where(r => r.DropId == drop.Id)
            .ToListAsync(cancellationToken);

        context.CharonViewReceipts.RemoveRange(receipts);
        context.CharonDrops.Remove(drop);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyCharonDropDeleted(drop.GhostListId, drop.Id);
    }
}
