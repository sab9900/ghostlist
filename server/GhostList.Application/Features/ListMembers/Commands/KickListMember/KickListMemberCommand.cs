using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.KickListMember;

public record KickListMemberCommand(Guid ListId, string DeviceId, string? OwnerToken) : IRequest;

public class KickListMemberCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<KickListMemberCommand>
{
    public async Task Handle(KickListMemberCommand request, CancellationToken cancellationToken)
    {
        var list = await context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.ListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.ListId);

        if (!list.IsOwnerTokenValid(request.OwnerToken))
            throw new ForbiddenException("Invalid owner token.");

        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null) return;

        context.GhostListMembers.Remove(member);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyMemberKicked(request.ListId, request.DeviceId);
    }
}
