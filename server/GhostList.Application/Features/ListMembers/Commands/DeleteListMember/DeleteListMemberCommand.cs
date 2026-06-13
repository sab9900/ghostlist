using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.DeleteListMember;

public record DeleteListMemberCommand(Guid ListId, string DeviceId) : IRequest;

public class DeleteListMemberCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteListMemberCommand>
{
    public async Task Handle(DeleteListMemberCommand request, CancellationToken cancellationToken)
    {
        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null) return;

        context.GhostListMembers.Remove(member);
        await context.SaveChangesAsync(cancellationToken);
    }
}
