using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageVideo;

public record GetGhostMessageVideoQuery(Guid MessageId) : IRequest<GhostMessageVideoDto>;

public record GhostMessageVideoDto(
    Guid MessageId,
    string EncryptedVideo,
    string VideoInitializationVector);

public class GetGhostMessageVideoQueryHandler(IBlobStorage blobStorage)
    : IRequestHandler<GetGhostMessageVideoQuery, GhostMessageVideoDto>
{
    public async Task<GhostMessageVideoDto> Handle(
        GetGhostMessageVideoQuery request,
        CancellationToken cancellationToken)
    {
        string payload;
        try
        {
            payload = await blobStorage.GetAsync(BlobKeys.ChatVideo(request.MessageId), cancellationToken);
        }
        catch
        {
            throw new NotFoundException(nameof(GhostMessageVideo), request.MessageId);
        }

        var separatorIndex = payload.IndexOf(':');
        if (separatorIndex < 0)
            throw new NotFoundException(nameof(GhostMessageVideo), request.MessageId);

        var iv = payload[..separatorIndex];
        var encryptedVideo = payload[(separatorIndex + 1)..];

        return new GhostMessageVideoDto(request.MessageId, encryptedVideo, iv);
    }
}
