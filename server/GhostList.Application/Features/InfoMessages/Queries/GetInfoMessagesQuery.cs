using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.InfoMessages.Queries;

public record GetInfoMessagesQuery : IRequest<List<InfoMessageDto>>;

public class GetInfoMessagesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetInfoMessagesQuery, List<InfoMessageDto>>
{
    public async Task<List<InfoMessageDto>> Handle(GetInfoMessagesQuery request, CancellationToken cancellationToken)
    {
        return await context.InfoMessages
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new InfoMessageDto(m.Id, m.Type, m.Title, m.Body, m.TargetPlatform, m.Version, m.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
