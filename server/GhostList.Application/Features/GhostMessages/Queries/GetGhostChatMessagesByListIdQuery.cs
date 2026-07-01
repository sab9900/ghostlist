using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;

public static class ChatMessagePaging
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 100;
}

public record GetGhostChatMessagesByListIdQuery(Guid ListId, DateTime? Before = null, int Take = ChatMessagePaging.DefaultPageSize)
    : IRequest<GhostChatMessagePageDto>;

public record GhostMessageReactionDto(
    Guid Id,
    string EncryptedEmoji,
    string EmojiInitializationVector,
    string EncryptedSenderName,
    string SenderNameInitializationVector,
    string? SenderDeviceId,
    string? SenderUserId);

public record GhostChatMessageDto(
    Guid Id,
    string EncryptedMessage,
    string MessageInitializationVector,
    string EncryptedSenderName,
    string SenderNameInitializationVector,
    Guid? ReplyToMessageId,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId,
    List<GhostMessageReactionDto> Reactions);

public record GhostChatMessagePageDto(List<GhostChatMessageDto> Messages, bool HasMore);

public class GetGhostChatMessagesByListIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostChatMessagesByListIdQuery, GhostChatMessagePageDto>
{
    public async Task<GhostChatMessagePageDto> Handle(
        GetGhostChatMessagesByListIdQuery request,
        CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.ListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(GhostChatMessage), request.ListId);

        var pageSize = Math.Clamp(request.Take, 1, ChatMessagePaging.MaxPageSize);

        var query = context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId);

        if (request.Before.HasValue)
            query = query.Where(m => m.CreatedAt < request.Before.Value);

        var fetched = await query
            .OrderByDescending(m => m.CreatedAt)
            .Take(pageSize + 1)
            .Select(m => new GhostChatMessageDto(
                m.Id,
                m.EncryptedMessage,
                m.InitializationVector,
                m.EncryptedSenderName,
                m.SenderNameInitializationVector,
                m.ReplyToMessageId,
                m.CreatedAt,
                m.SenderDeviceId,
                m.SenderUserId,
                new List<GhostMessageReactionDto>()))
            .ToListAsync(cancellationToken);

        var hasMore = fetched.Count > pageSize;
        var page = fetched.Take(pageSize).Reverse().ToList();

        var messageIds = page.Select(m => m.Id).ToList();

        var reactions = await context.GhostMessageReactions
            .Where(r => messageIds.Contains(r.MessageId))
            .Select(r => new { r.MessageId, Dto = new GhostMessageReactionDto(
                r.Id,
                r.EncryptedEmoji,
                r.EmojiInitializationVector,
                r.EncryptedSenderName,
                r.SenderNameInitializationVector,
                r.SenderDeviceId,
                r.SenderUserId) })
            .ToListAsync(cancellationToken);

        var reactionsByMessage = reactions.GroupBy(r => r.MessageId)
            .ToDictionary(g => g.Key, g => g.Select(r => r.Dto).ToList());

        var pageWithReactions = page
            .Select(m => m with { Reactions = reactionsByMessage.TryGetValue(m.Id, out var r) ? r : [] })
            .ToList();

        return new GhostChatMessagePageDto(pageWithReactions, hasMore);
    }
}
