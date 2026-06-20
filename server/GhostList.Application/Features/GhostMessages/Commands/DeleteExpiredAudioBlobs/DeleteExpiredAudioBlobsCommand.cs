using GhostList.Application.Common;
using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredAudioBlobs;

public record DeleteExpiredAudioBlobsCommand : IRequest<int>;

public class DeleteExpiredAudioBlobsCommandHandler(IBlobStorage blobStorage)
    : IRequestHandler<DeleteExpiredAudioBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public async Task<int> Handle(DeleteExpiredAudioBlobsCommand request, CancellationToken cancellationToken)
    {
        var expiredKeys = await blobStorage.ListKeysOlderThanAsync(BlobKeys.ChatAudioPrefix, RetentionWindow, cancellationToken);
        if (expiredKeys.Count == 0) return 0;
        await blobStorage.DeleteManyAsync(expiredKeys, cancellationToken);
        return expiredKeys.Count;
    }
}
