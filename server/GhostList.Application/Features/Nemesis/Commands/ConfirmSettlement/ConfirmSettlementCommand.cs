using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.ConfirmSettlement;

public record ConfirmSettlementCommand(Guid SettlementId) : IRequest;

public class ConfirmSettlementCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<ConfirmSettlementCommand>
{
    public async Task Handle(ConfirmSettlementCommand request, CancellationToken cancellationToken)
    {
        var settlement = await context.NemesisSettlements
            .FirstOrDefaultAsync(s => s.Id == request.SettlementId, cancellationToken);

        if (settlement is null)
            throw new NotFoundException(nameof(Domain.Entities.NemesisSettlement), request.SettlementId);

        settlement.ConfirmReceipt();
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisSettlementConfirmed(settlement.GhostListId, new NemesisSettlementConfirmedNotification(
            settlement.Id,
            settlement.GhostListId,
            settlement.ConfirmedAt!.Value));

        if (settlement.PayerUserId is not null)
        {
            IReadOnlyList<string> payerTargets = [settlement.PayerUserId];
            _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisSettlementUpdate, null, cancellationToken, targetUserIds: payerTargets)
                     .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }
}
