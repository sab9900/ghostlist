using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageImage;

public record GetGhostMessageImageQuery(Guid MessageId) : IRequest<GhostMessageImageDto>;

public record GhostMessageImageDto(
    Guid MessageId,
    string EncryptedImage,
    string ImageInitializationVector);

public class GetGhostMessageImageQueryHandler(IBlobStorage blobStorage)
    : IRequestHandler<GetGhostMessageImageQuery, GhostMessageImageDto>
{
    public async Task<GhostMessageImageDto> Handle(
        GetGhostMessageImageQuery request,
        CancellationToken cancellationToken)
    {
        string payload;
        try
        {
            payload = await blobStorage.GetAsync(BlobKeys.ChatImage(request.MessageId), cancellationToken);
        }
        catch
        {
            throw new NotFoundException(nameof(GhostMessageImage), request.MessageId);
        }

        var separatorIndex = payload.IndexOf(':');
        if (separatorIndex < 0)
            throw new NotFoundException(nameof(GhostMessageImage), request.MessageId);

        var iv = payload[..separatorIndex];
        var encryptedImage = payload[(separatorIndex + 1)..];

        return new GhostMessageImageDto(request.MessageId, encryptedImage, iv);
    }
}
