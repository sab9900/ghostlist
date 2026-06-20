using GhostList.Application.Common;
using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.Charon.Commands.DeleteExpiredCharonDrops;

public record DeleteExpiredCharonDropsCommand : IRequest<int>;

public class DeleteExpiredCharonDropsCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage, IGhostListNotifier notifier)
    : IRequestHandler<DeleteExpiredCharonDropsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromDays(7);

    public async Task<int> Handle(DeleteExpiredCharonDropsCommand request, CancellationToken cancellationToken)
    {
        var deleted = await context.DeleteExpiredCharonDropsAsync(RetentionWindow, cancellationToken);
        if (deleted.Count == 0) return 0;

        var blobKeys = deleted.Select(d => BlobKeys.CharonDrop(d.ItemId));
        await blobStorage.DeleteManyAsync(blobKeys, cancellationToken);

        var notifications = deleted.Select(d => notifier.NotifyCharonDropDeleted(d.ListId, d.ItemId));
        await Task.WhenAll(notifications);

        return deleted.Count;
    }
}
