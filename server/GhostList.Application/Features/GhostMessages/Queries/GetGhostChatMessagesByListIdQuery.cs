using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;

public record GetGhostChatMessagesByListIdQuery(Guid ListId) : IRequest<List<GhostChatMessageDto>>;

public record GhostChatMessageDto(
    Guid Id,
    string EncryptedMessage,
    string MessageInitializationVector,
    string EncryptedSenderName,
    string SenderNameInitializationVector,
    Guid? ReplyToMessageId,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId);

public class GetGhostChatMessagesByListIdQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetGhostChatMessagesByListIdQuery, List<GhostChatMessageDto>>
{
    public async Task<List<GhostChatMessageDto>> Handle(
        GetGhostChatMessagesByListIdQuery request,
        CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.ListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(GhostChatMessage), request.ListId);

        return await context.GhostChatMessages
            .Where(m => m.GhostListId == request.ListId)
            .OrderBy(m => m.CreatedAt)
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
            .ToListAsync(cancellationToken);
    }
}
