using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.ForgiveSettlement;

public record ForgiveSettlementCommand(Guid SettlementId) : IRequest;

public class ForgiveSettlementCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<ForgiveSettlementCommand>
{
    public async Task Handle(ForgiveSettlementCommand request, CancellationToken cancellationToken)
    {
        var settlement = await context.NemesisSettlements
            .FirstOrDefaultAsync(s => s.Id == request.SettlementId, cancellationToken);

        if (settlement is null)
            throw new NotFoundException(nameof(NemesisSettlement), request.SettlementId);

        settlement.Forgive();
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisSettlementForgiven(settlement.GhostListId, new NemesisSettlementForgivenNotification(
            settlement.Id,
            settlement.GhostListId));

        if (settlement.PayerUserId is not null)
        {
            IReadOnlyList<string> payerTargets = [settlement.PayerUserId];
            _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisSettlementForgiven, null, cancellationToken, targetUserIds: payerTargets)
                     .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }
}
