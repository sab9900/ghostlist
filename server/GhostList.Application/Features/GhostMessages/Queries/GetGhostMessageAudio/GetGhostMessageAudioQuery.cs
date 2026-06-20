using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageAudio;

public record GetGhostMessageAudioQuery(Guid MessageId) : IRequest<GhostMessageAudioDto>;

public record GhostMessageAudioDto(
    Guid MessageId,
    string EncryptedAudio,
    string AudioInitializationVector);

public class GetGhostMessageAudioQueryHandler(IBlobStorage blobStorage)
    : IRequestHandler<GetGhostMessageAudioQuery, GhostMessageAudioDto>
{
    public async Task<GhostMessageAudioDto> Handle(
        GetGhostMessageAudioQuery request,
        CancellationToken cancellationToken)
    {
        string payload;
        try
        {
            payload = await blobStorage.GetAsync(BlobKeys.ChatAudio(request.MessageId), cancellationToken);
        }
        catch
        {
            throw new NotFoundException(nameof(GhostMessageAudio), request.MessageId);
        }

        var separatorIndex = payload.IndexOf(':');
        if (separatorIndex < 0)
            throw new NotFoundException(nameof(GhostMessageAudio), request.MessageId);

        var iv = payload[..separatorIndex];
        var encryptedAudio = payload[(separatorIndex + 1)..];

        return new GhostMessageAudioDto(request.MessageId, encryptedAudio, iv);
    }
}
