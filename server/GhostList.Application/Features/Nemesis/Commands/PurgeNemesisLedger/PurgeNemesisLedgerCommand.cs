using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.PurgeNemesisLedger;

public record PurgeNemesisLedgerCommand(Guid GhostListId) : IRequest;

public class PurgeNemesisLedgerCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<PurgeNemesisLedgerCommand>
{
    public async Task Handle(PurgeNemesisLedgerCommand request, CancellationToken cancellationToken)
    {
        var expenses = await context.NemesisExpenses
            .Where(e => e.GhostListId == request.GhostListId && e.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var settlements = await context.NemesisSettlements
            .Where(s => s.GhostListId == request.GhostListId && s.DeletedAt == null)
            .ToListAsync(cancellationToken);

        if (expenses.Count == 0 && settlements.Count == 0)
            return;

        foreach (var expense in expenses)
            expense.SoftDelete();

        foreach (var settlement in settlements)
            settlement.SoftDelete();

        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisLedgerPurged(request.GhostListId, new NemesisLedgerPurgedNotification(request.GhostListId));
    }
}
