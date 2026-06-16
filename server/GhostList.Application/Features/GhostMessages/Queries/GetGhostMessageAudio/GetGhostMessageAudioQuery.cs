using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostMessageAudio;

public record GetGhostMessageAudioQuery(Guid MessageId) : IRequest<GhostMessageAudioDto>;

public record GhostMessageAudioDto(
    Guid MessageId,
    string EncryptedAudio,
    string AudioInitializationVector);

public class GetGhostMessageAudioQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostMessageAudioQuery, GhostMessageAudioDto>
{
    public async Task<GhostMessageAudioDto> Handle(
        GetGhostMessageAudioQuery request,
        CancellationToken cancellationToken)
    {
        var audio = await context.GhostMessageAudios
            .Where(a => a.Id == request.MessageId)
            .Select(a => new GhostMessageAudioDto(a.Id, a.EncryptedAudio, a.AudioInitializationVector))
            .FirstOrDefaultAsync(cancellationToken);

        if (audio is null)
            throw new NotFoundException(nameof(GhostMessageAudio), request.MessageId);

        return audio;
    }
}
