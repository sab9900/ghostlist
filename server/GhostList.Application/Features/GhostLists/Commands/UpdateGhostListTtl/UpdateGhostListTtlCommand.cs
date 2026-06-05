using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Commands.UpdateGhostListTtl;

public record UpdateGhostListTtlCommand(Guid ListId, DeleteAfterDuration Ttl) : IRequest;

public class UpdateGhostListTtlCommandHandler : IRequestHandler<UpdateGhostListTtlCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;

    public UpdateGhostListTtlCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(UpdateGhostListTtlCommand request, CancellationToken cancellationToken)
    {
        var list = await _context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.ListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.ListId);

        list.UpdateTtl(request.Ttl);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyTtlUpdated(list.Id, (int)list.CompletedItemsTtl);
    }
}
