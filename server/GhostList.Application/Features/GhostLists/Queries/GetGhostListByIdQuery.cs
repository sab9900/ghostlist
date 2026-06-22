using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Queries.GetGhostListById;

public record GetGhostListByIdQuery(Guid Id) : IRequest<GhostListDto?>;

public record GhostListDto(Guid Id, int Ttl, int WhisperLifetimeSeconds, DateTime CreatedAt, List<GhostListItemDto> Items, List<GhostChatMessageDto> ChatMessages, bool HasMoreMessages);
public record GhostListItemDto(Guid Id, string EncryptedPayload, string InitializationVector, bool IsChecked, DateTime? CheckedAt, DateTime CreatedAt, string? SenderDeviceId, string? SenderUserId);
public record GhostChatMessageDto(Guid Id, string EncryptedMessage, string MessageInitializationVector, string EncryptedSenderName, string SenderNameInitializationVector, Guid? ReplyToMessageId, DateTime CreatedAt, string? SenderDeviceId, string? SenderUserId);

public class GetGhostListByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetGhostListByIdQuery, GhostListDto?>
{
    public async Task<GhostListDto?> Handle(GetGhostListByIdQuery request, CancellationToken cancellationToken)
    {
        var list = await context.GhostLists
            .Include(gl => gl.Items)
            .FirstOrDefaultAsync(gl => gl.Id == request.Id, cancellationToken);

        if (list == null) return null;

        var fetchedMessages = await context.GhostChatMessages
            .Where(m => m.GhostListId == list.Id)
            .OrderByDescending(m => m.CreatedAt)
            .Take(ChatMessagePaging.DefaultPageSize + 1)
            .ToListAsync(cancellationToken);

        var hasMoreMessages = fetchedMessages.Count > ChatMessagePaging.DefaultPageSize;
        var recentMessages = fetchedMessages.Take(ChatMessagePaging.DefaultPageSize).Reverse();

        return new GhostListDto(
            list.Id,
            (int)list.CompletedItemsTtl,
            (int)list.WhisperLifetimeSeconds,
            list.CreatedAt,
            list.Items
                .Select(i => new GhostListItemDto(i.Id, i.EncryptedPayload, i.InitializationVector, i.IsChecked, i.CheckedAt, i.CreatedAt, i.SenderDeviceId, i.SenderUserId))
                .ToList(),
            recentMessages
                .Select(m => new GhostChatMessageDto(
                    m.Id,
                    m.EncryptedMessage,
                    m.InitializationVector,
                    m.EncryptedSenderName,
                    m.SenderNameInitializationVector,
                    m.ReplyToMessageId,
                    m.CreatedAt,
                    m.SenderDeviceId,
                    m.SenderUserId))
                .ToList(),
            hasMoreMessages);
    }
}
