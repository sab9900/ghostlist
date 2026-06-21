using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Commands.UpdateGhostListWhisperLifetime;

public record UpdateGhostListWhisperLifetimeCommand(Guid ListId, WhisperLifetime Lifetime) : IRequest;

public class UpdateGhostListWhisperLifetimeCommandHandler : IRequestHandler<UpdateGhostListWhisperLifetimeCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IGhostListNotifier _notifier;

    public UpdateGhostListWhisperLifetimeCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(UpdateGhostListWhisperLifetimeCommand request, CancellationToken cancellationToken)
    {
        var list = await _context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.ListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.ListId);

        list.UpdateWhisperLifetime(request.Lifetime);
        await _context.SaveChangesAsync(cancellationToken);

        await _notifier.NotifyWhisperLifetimeUpdated(list.Id, (int)list.WhisperLifetimeSeconds);
    }
}
