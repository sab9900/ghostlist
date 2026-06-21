using GhostList.Application.Common;
using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredVideoBlobs;

public record DeleteExpiredVideoBlobsCommand : IRequest<int>;

public class DeleteExpiredVideoBlobsCommandHandler(IBlobStorage blobStorage)
    : IRequestHandler<DeleteExpiredVideoBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public async Task<int> Handle(DeleteExpiredVideoBlobsCommand request, CancellationToken cancellationToken)
    {
        var expiredKeys = await blobStorage.ListKeysOlderThanAsync(BlobKeys.ChatVideoPrefix, RetentionWindow, cancellationToken);
        if (expiredKeys.Count == 0) return 0;
        await blobStorage.DeleteManyAsync(expiredKeys, cancellationToken);
        return expiredKeys.Count;
    }
}
