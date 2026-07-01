using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.DeclineSettlement;

public record DeclineSettlementCommand(Guid SettlementId) : IRequest;

public class DeclineSettlementCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<DeclineSettlementCommand>
{
    public async Task Handle(DeclineSettlementCommand request, CancellationToken cancellationToken)
    {
        var settlement = await context.NemesisSettlements
            .FirstOrDefaultAsync(s => s.Id == request.SettlementId, cancellationToken);

        if (settlement is null)
            throw new NotFoundException(nameof(NemesisSettlement), request.SettlementId);

        settlement.Decline();
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisSettlementDeclined(settlement.GhostListId, new NemesisSettlementDeclinedNotification(
            request.SettlementId,
            settlement.GhostListId));

        if (settlement.PayerUserId is not null)
        {
            IReadOnlyList<string> payerTargets = [settlement.PayerUserId];
            _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisUpdate, null, cancellationToken, targetUserIds: payerTargets)
                     .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }
}
