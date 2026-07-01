using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Queries.GetCharonDropsByListId;

public record GetCharonDropsByListIdQuery(Guid ListId, string DeviceId, string? UserId = null) : IRequest<List<CharonDropDto>>;

public record CharonDropDto(
    Guid Id,
    Guid GhostListId,
    string EncryptedContent,
    string ContentInitializationVector,
    string EncryptedMetadata,
    string MetadataInitializationVector,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId,
    List<string> ViewerIds);

public class GetCharonDropsByListIdQueryHandler(IApplicationDbContext context, IBlobStorage blobStorage)
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

        bool IsSender(Domain.Entities.CharonDrop d) =>
            request.UserId != null
                ? d.SenderUserId == request.UserId
                : d.SenderDeviceId == request.DeviceId;

        var viewedDropIds = context.CharonViewReceipts
            .Where(r => request.UserId != null
                ? r.UserId == request.UserId
                : r.DeviceId == request.DeviceId)
            .Select(r => r.DropId);

        var drops = await context.CharonDrops
            .Where(d => d.GhostListId == request.ListId)
            .Where(d =>
                (request.UserId != null ? d.SenderUserId == request.UserId : d.SenderDeviceId == request.DeviceId)
                || !viewedDropIds.Contains(d.Id))
            .OrderBy(d => d.CreatedAt)
            .ToListAsync(cancellationToken);

        var allReceipts = await context.CharonViewReceipts
            .Where(r => drops.Select(d => d.Id).Contains(r.DropId))
            .Select(r => new { r.DropId, Identity = r.UserId ?? r.DeviceId })
            .ToListAsync(cancellationToken);

        var receiptsByDrop = allReceipts
            .GroupBy(r => r.DropId)
            .ToDictionary(g => g.Key, g => g.Select(r => r.Identity).Distinct().ToList());

        var results = await Task.WhenAll(drops.Select(async d =>
        {
            string encryptedContent = string.Empty;
            string contentIv = string.Empty;

            try
            {
                var payload = await blobStorage.GetAsync(BlobKeys.CharonDrop(d.Id), cancellationToken);
                var separatorIndex = payload.IndexOf(':');
                if (separatorIndex >= 0)
                {
                    contentIv = payload[..separatorIndex];
                    encryptedContent = payload[(separatorIndex + 1)..];
                }
            }
            catch { }

            var viewerIds = IsSender(d) && receiptsByDrop.TryGetValue(d.Id, out var ids)
                ? ids
                : [];

            return new CharonDropDto(
                d.Id,
                d.GhostListId,
                encryptedContent,
                contentIv,
                d.EncryptedMetadata,
                d.MetadataInitializationVector,
                d.CreatedAt,
                d.SenderDeviceId,
                d.SenderUserId,
                viewerIds);
        }));

        return [.. results];
    }
}
