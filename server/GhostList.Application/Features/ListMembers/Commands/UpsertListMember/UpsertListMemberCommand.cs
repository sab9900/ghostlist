using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.UpsertListMember;

public record UpsertListMemberCommand(
    Guid ListId,
    string DeviceId,
    string EncryptedPayload,
    string InitializationVector) : IRequest;

public class UpsertListMemberCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpsertListMemberCommand>
{
    public async Task Handle(UpsertListMemberCommand request, CancellationToken cancellationToken)
    {
        var existing = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (existing is not null)
        {
            existing.EncryptedPayload = request.EncryptedPayload;
            existing.InitializationVector = request.InitializationVector;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            context.GhostListMembers.Add(new GhostListMember
            {
                Id = Guid.NewGuid(),
                GhostListId = request.ListId,
                DeviceId = request.DeviceId,
                EncryptedPayload = request.EncryptedPayload,
                InitializationVector = request.InitializationVector,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
        }

        await context.SaveChangesAsync(cancellationToken);
    }
}
