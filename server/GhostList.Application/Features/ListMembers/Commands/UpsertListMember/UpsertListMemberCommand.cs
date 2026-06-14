using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.UpsertListMember;

public record UpsertListMemberCommand(
    Guid ListId,
    string DeviceId,
    string EncryptedPayload,
    string InitializationVector,
    string? UserId = null) : IRequest;

public class UpsertListMemberCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<UpsertListMemberCommand>
{
    public const int MaxMembersPerList = 30;

    public async Task Handle(UpsertListMemberCommand request, CancellationToken cancellationToken)
    {
        var existing = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        var isNewMember = existing is null;

        if (isNewMember)
        {
            var memberCount = await context.GhostListMembers
                .CountAsync(m => m.GhostListId == request.ListId, cancellationToken);

            if (memberCount >= MaxMembersPerList)
                throw new ListFullException();
        }

        if (existing is not null)
        {
            existing.EncryptedPayload = request.EncryptedPayload;
            existing.InitializationVector = request.InitializationVector;
            existing.UserId = request.UserId;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            context.GhostListMembers.Add(new GhostListMember
            {
                Id = Guid.NewGuid(),
                GhostListId = request.ListId,
                DeviceId = request.DeviceId,
                UserId = request.UserId,
                EncryptedPayload = request.EncryptedPayload,
                InitializationVector = request.InitializationVector,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
        }

        await context.SaveChangesAsync(cancellationToken);

        if (isNewMember)
        {
            await context.IncrementDailyUsageAsync(UsageMetric.Member, cancellationToken);
            await notifier.NotifyMemberJoined(request.ListId, request.DeviceId);
        }
    }
}
