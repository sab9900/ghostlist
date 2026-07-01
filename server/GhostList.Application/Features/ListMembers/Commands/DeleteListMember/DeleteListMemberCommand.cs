using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.Nemesis.Commands.VoidMemberSettlements;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.DeleteListMember;

public record DeleteListMemberCommand(Guid ListId, string DeviceId, string? RequestingDeviceId, string? RequestingUserId) : IRequest;

public class DeleteListMemberCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IMediator mediator)
    : IRequestHandler<DeleteListMemberCommand>
{
    public async Task Handle(DeleteListMemberCommand request, CancellationToken cancellationToken)
    {
        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null) return;

        var isCurrentDevice = member.DeviceId == request.RequestingDeviceId;
        var isSameUser = !string.IsNullOrWhiteSpace(request.RequestingUserId)
            && member.UserId == request.RequestingUserId;

        if (!isCurrentDevice && !isSameUser)
            throw new ForbiddenException("Cannot remove another user's device.");

        var userId = member.UserId;
        context.GhostListMembers.Remove(member);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyMemberKicked(request.ListId, request.DeviceId);

        if (!string.IsNullOrWhiteSpace(userId))
            await mediator.Send(new VoidMemberSettlementsCommand(request.ListId, userId), cancellationToken);
    }
}
