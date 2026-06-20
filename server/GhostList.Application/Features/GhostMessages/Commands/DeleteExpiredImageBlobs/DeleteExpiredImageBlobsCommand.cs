using GhostList.Application.Common;
using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredImageBlobs;

public record DeleteExpiredImageBlobsCommand : IRequest<int>;

public class DeleteExpiredImageBlobsCommandHandler(IBlobStorage blobStorage)
    : IRequestHandler<DeleteExpiredImageBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public async Task<int> Handle(DeleteExpiredImageBlobsCommand request, CancellationToken cancellationToken)
    {
        var expiredKeys = await blobStorage.ListKeysOlderThanAsync(BlobKeys.ChatImagePrefix, RetentionWindow, cancellationToken);
        if (expiredKeys.Count == 0) return 0;
        await blobStorage.DeleteManyAsync(expiredKeys, cancellationToken);
        return expiredKeys.Count;
    }
}
