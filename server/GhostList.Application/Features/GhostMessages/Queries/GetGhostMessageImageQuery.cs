using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageImage;

public record GetGhostMessageImageQuery(Guid MessageId) : IRequest<GhostMessageImageDto>;

public record GhostMessageImageDto(
    Guid MessageId,
    string EncryptedImage,
    string ImageInitializationVector);

public class GetGhostMessageImageQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostMessageImageQuery, GhostMessageImageDto>
{
    public async Task<GhostMessageImageDto> Handle(
        GetGhostMessageImageQuery request,
        CancellationToken cancellationToken)
    {
        var image = await context.GhostMessageImages
            .Where(i => i.Id == request.MessageId)
            .Select(i => new GhostMessageImageDto(i.Id, i.EncryptedImage, i.ImageInitializationVector))
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
            throw new NotFoundException(nameof(GhostMessageImage), request.MessageId);

        return image;
    }
}
