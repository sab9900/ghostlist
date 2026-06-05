using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteGhostChatMessage;

public record DeleteGhostChatMessageCommand(Guid MessageId) : IRequest;

public class DeleteGhostChatMessageCommandHandler : IRequestHandler<DeleteGhostChatMessageCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;

    public DeleteGhostChatMessageCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(DeleteGhostChatMessageCommand request, CancellationToken cancellationToken)
    {
        var message = await _context.GhostChatMessages
            .FirstOrDefaultAsync(m => m.Id == request.MessageId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostChatMessage), request.MessageId);

        _context.GhostChatMessages.Remove(message);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyMessageDeleted(message.GhostListId, message.Id);
    }
}
