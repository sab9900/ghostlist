using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.InfoMessages.Queries;

/// <summary>
/// The most recent info message visible to <paramref name="Platform"/>, or null if none has been
/// published yet. Public — used by standard clients. A message with no <c>TargetPlatform</c> is
/// visible to everyone; one with a <c>TargetPlatform</c> is only visible to that platform.
/// </summary>
public record GetLatestInfoMessageQuery(DevicePlatform? Platform) : IRequest<InfoMessageDto?>;

public class GetLatestInfoMessageQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetLatestInfoMessageQuery, InfoMessageDto?>
{
    public async Task<InfoMessageDto?> Handle(GetLatestInfoMessageQuery request, CancellationToken cancellationToken)
    {
        return await context.InfoMessages
            .Where(m => m.TargetPlatform == null || m.TargetPlatform == request.Platform)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new InfoMessageDto(m.Id, m.Type, m.Title, m.Body, m.TargetPlatform, m.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
