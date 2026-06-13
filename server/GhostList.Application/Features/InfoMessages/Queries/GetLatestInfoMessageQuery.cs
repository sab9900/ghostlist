using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.InfoMessages.Queries;

/// <summary>The most recent info message, or null if none has been published yet. Public — used by standard clients.</summary>
public record GetLatestInfoMessageQuery : IRequest<InfoMessageDto?>;

public class GetLatestInfoMessageQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetLatestInfoMessageQuery, InfoMessageDto?>
{
    public async Task<InfoMessageDto?> Handle(GetLatestInfoMessageQuery request, CancellationToken cancellationToken)
    {
        return await context.InfoMessages
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new InfoMessageDto(m.Id, m.Type, m.Title, m.Body, m.CreatedAt))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
