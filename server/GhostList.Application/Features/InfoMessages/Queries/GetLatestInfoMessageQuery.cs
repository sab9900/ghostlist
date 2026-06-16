using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.InfoMessages.Queries;

public record GetLatestInfoMessageQuery(DevicePlatform? Platform) : IRequest<InfoMessageDto?>;

public class GetLatestInfoMessageQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetLatestInfoMessageQuery, InfoMessageDto?>
{
    public async Task<InfoMessageDto?> Handle(GetLatestInfoMessageQuery request, CancellationToken cancellationToken)
    {
        return await context.InfoMessages
            .Where(m => m.TargetPlatform == null || m.TargetPlatform == request.Platform)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new InfoMessageDto(m.Id, m.Type, m.Title, m.Body, m.TargetPlatform, m.Version, m.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
