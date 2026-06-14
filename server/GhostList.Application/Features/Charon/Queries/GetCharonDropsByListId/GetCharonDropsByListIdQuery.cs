using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Queries.GetCharonDropsByListId;

/// <summary>
/// Returns the Charon drops in a list that <paramref name="DeviceId"/> has
/// not yet viewed - i.e. its personal "sealed drops" queue.
/// </summary>
public record GetCharonDropsByListIdQuery(Guid ListId, string DeviceId) : IRequest<List<CharonDropDto>>;

public record CharonDropDto(
    Guid Id,
    Guid GhostListId,
    string EncryptedContent,
    string ContentInitializationVector,
    string EncryptedMetadata,
    string MetadataInitializationVector,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId);

public class GetCharonDropsByListIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetCharonDropsByListIdQuery, List<CharonDropDto>>
{
    public async Task<List<CharonDropDto>> Handle(
        GetCharonDropsByListIdQuery request,
        CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.ListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(Domain.Entities.GhostList), request.ListId);

        var viewedDropIds = context.CharonViewReceipts
            .Where(r => r.DeviceId == request.DeviceId)
            .Select(r => r.DropId);

        return await context.CharonDrops
            .Where(d => d.GhostListId == request.ListId && !viewedDropIds.Contains(d.Id))
            .OrderBy(d => d.CreatedAt)
            .Select(d => new CharonDropDto(
                d.Id,
                d.GhostListId,
                d.EncryptedContent,
                d.ContentInitializationVector,
                d.EncryptedMetadata,
                d.MetadataInitializationVector,
                d.CreatedAt,
                d.SenderDeviceId,
                d.SenderUserId))
            .ToListAsync(cancellationToken);
    }
}
