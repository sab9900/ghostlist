using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Commands.DeleteGhostList;

public record DeleteGhostListCommand(Guid ListId) : IRequest;

public class DeleteGhostListCommandHandler : IRequestHandler<DeleteGhostListCommand>
{
    private readonly IApplicationDbContext _context;

    public DeleteGhostListCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task Handle(DeleteGhostListCommand request, CancellationToken cancellationToken)
    {
        var list = await _context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.ListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.ListId);

        _context.GhostListItems.RemoveRange(
            _context.GhostListItems.Where(i => i.GhostListId == request.ListId));
        _context.GhostChatMessages.RemoveRange(
            _context.GhostChatMessages.Where(m => m.GhostListId == request.ListId));
        _context.GhostLists.Remove(list);

        await _context.SaveChangesAsync(cancellationToken);
    }
}
