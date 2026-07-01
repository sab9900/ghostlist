using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.VoidMemberSettlements;

public record VoidMemberSettlementsCommand(Guid ListId, string? UserId) : IRequest;

public class VoidMemberSettlementsCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<VoidMemberSettlementsCommand>
{
    public async Task Handle(VoidMemberSettlementsCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.UserId)) return;

        var settlements = await context.NemesisSettlements
            .Where(s => s.GhostListId == request.ListId
                     && s.Status == SettlementStatus.Pending
                     && (s.PayerUserId == request.UserId || s.ReceiverUserId == request.UserId))
            .ToListAsync(cancellationToken);

        if (settlements.Count == 0) return;

        foreach (var settlement in settlements)
            settlement.Void();

        await context.SaveChangesAsync(cancellationToken);

        foreach (var settlement in settlements)
        {
            await notifier.NotifyNemesisSettlementVoided(settlement.GhostListId, new NemesisSettlementVoidedNotification(
                settlement.Id,
                settlement.GhostListId));

            var otherUserId = settlement.PayerUserId == request.UserId
                ? settlement.ReceiverUserId
                : settlement.PayerUserId;

            if (otherUserId is not null)
            {
                IReadOnlyList<string> targets = [otherUserId];
                _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisSettlementVoided, null, cancellationToken, targetUserIds: targets)
                         .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
            }
        }
    }
}
