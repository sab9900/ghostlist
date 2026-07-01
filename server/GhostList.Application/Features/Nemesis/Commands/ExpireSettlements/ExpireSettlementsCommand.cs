using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.ExpireSettlements;

public record ExpireSettlementsCommand : IRequest;

public class ExpireSettlementsCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<ExpireSettlementsCommand>
{
    public async Task Handle(ExpireSettlementsCommand request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var pending = await (
            from s in context.NemesisSettlements
            join l in context.GhostLists on s.GhostListId equals l.Id
            where s.Status == SettlementStatus.Pending
            select new
            {
                Settlement = s,
                l.NemesisSettlementExpiryDays,
            }
        ).ToListAsync(cancellationToken);

        var toExpire = pending
            .Where(x => (now - x.Settlement.CreatedAt).TotalDays >= x.NemesisSettlementExpiryDays)
            .Select(x => x.Settlement)
            .ToList();

        var toWarn = pending
            .Where(x =>
            {
                var daysOld = (now - x.Settlement.CreatedAt).TotalDays;
                var daysLeft = x.NemesisSettlementExpiryDays - daysOld;
                return daysLeft is >= 6 and < 7;
            })
            .Select(x => (Settlement: x.Settlement, DaysLeft: (int)Math.Ceiling(x.NemesisSettlementExpiryDays - (now - x.Settlement.CreatedAt).TotalDays)))
            .ToList();

        foreach (var settlement in toExpire)
        {
            settlement.Expire();
            await notifier.NotifyNemesisSettlementExpired(settlement.GhostListId, new NemesisSettlementExpiredNotification(
                settlement.Id,
                settlement.GhostListId));

            var targets = new List<string>();
            if (settlement.PayerUserId is not null) targets.Add(settlement.PayerUserId);
            if (settlement.ReceiverUserId is not null && settlement.ReceiverUserId != settlement.PayerUserId)
                targets.Add(settlement.ReceiverUserId);

            if (targets.Count > 0)
                _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisSettlementExpired, null, cancellationToken, targetUserIds: targets)
                         .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }

        foreach (var (settlement, daysLeft) in toWarn)
        {
            await notifier.NotifyNemesisSettlementExpiring(settlement.GhostListId, new NemesisSettlementExpiringNotification(
                settlement.Id,
                settlement.GhostListId,
                daysLeft));

            var targets = new List<string>();
            if (settlement.PayerUserId is not null) targets.Add(settlement.PayerUserId);
            if (settlement.ReceiverUserId is not null && settlement.ReceiverUserId != settlement.PayerUserId)
                targets.Add(settlement.ReceiverUserId);

            if (targets.Count > 0)
                _ = push.SendNotificationAsync(settlement.GhostListId, PushNotificationType.NemesisSettlementExpiring, null, cancellationToken, targetUserIds: targets)
                         .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }

        if (toExpire.Count > 0)
            await context.SaveChangesAsync(cancellationToken);
    }
}
