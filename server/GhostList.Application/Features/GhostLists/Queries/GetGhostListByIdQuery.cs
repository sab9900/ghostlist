using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Queries.GetGhostListById;

public record GetGhostListByIdQuery(Guid Id) : IRequest<GhostListDto?>;

public record GhostListDto(Guid Id, int Ttl, DateTime CreatedAt, List<GhostListItemDto> Items, List<GhostChatMessageDto> ChatMessages);
public record GhostListItemDto(Guid Id, string EncryptedPayload, string InitializationVector, bool IsChecked);
public record GhostChatMessageDto(Guid Id, string EncryptedMessage, string MessageInitializationVector, string EncryptedSenderName, string SenderNameInitializationVector, DateTime CreatedAt);

public class GetGhostListByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetGhostListByIdQuery, GhostListDto?>
{
    public async Task<GhostListDto?> Handle(GetGhostListByIdQuery request, CancellationToken cancellationToken)
    {
        var list = await context.GhostLists
            .Include(gl => gl.Items)
            .Include(gl => gl.ChatMessages)
            .FirstOrDefaultAsync(gl => gl.Id == request.Id, cancellationToken);

        if (list == null) return null;

        return new GhostListDto(
            list.Id,
            (int)list.CompletedItemsTtl,
            list.CreatedAt,
            list.Items
                .Select(i => new GhostListItemDto(i.Id, i.EncryptedPayload, i.InitializationVector, i.IsChecked))
                .ToList(),
            list.ChatMessages
                .OrderBy(m => m.CreatedAt)
                .Select(m => new GhostChatMessageDto(
                    m.Id,
                    m.EncryptedMessage,
                    m.InitializationVector,
                    m.EncryptedSenderName,
                    m.SenderNameInitializationVector,
                    m.CreatedAt))
                .ToList());
    }
}
