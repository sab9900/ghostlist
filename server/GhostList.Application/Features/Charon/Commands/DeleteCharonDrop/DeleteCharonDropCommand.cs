using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.DeleteCharonDrop;

public record DeleteCharonDropCommand(Guid DropId) : IRequest;

public class DeleteCharonDropCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage, IGhostListNotifier notifier)
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

        await blobStorage.DeleteAsync(BlobKeys.CharonDrop(drop.Id), cancellationToken);
        await notifier.NotifyCharonDropDeleted(drop.GhostListId, drop.Id);
    }
}
