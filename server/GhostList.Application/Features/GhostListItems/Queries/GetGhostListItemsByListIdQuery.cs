using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostListItems.Queries.GetGhostListItemsByListId;

public record GetGhostListItemsByListIdQuery(Guid ListId) : IRequest<List<GhostListItemDto>>;

public record GhostListItemDto(
    Guid Id,
    string EncryptedPayload,
    string InitializationVector,
    bool IsChecked,
    DateTime? CheckedAt,
    DateTime CreatedAt);

public class GetGhostListItemsByListIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostListItemsByListIdQuery, List<GhostListItemDto>>
{
    public async Task<List<GhostListItemDto>> Handle(
        GetGhostListItemsByListIdQuery request,
        CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.ListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(GhostList), request.ListId);

        return await context.GhostListItems
            .Where(i => i.GhostListId == request.ListId)
            .OrderBy(i => i.CreatedAt)
            .Select(i => new GhostListItemDto(
                i.Id,
                i.EncryptedPayload,
                i.InitializationVector,
                i.IsChecked,
                i.CheckedAt,
                i.CreatedAt))
            .ToListAsync(cancellationToken);
    }
}
