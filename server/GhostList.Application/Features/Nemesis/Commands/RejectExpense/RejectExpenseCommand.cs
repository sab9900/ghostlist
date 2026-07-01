using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.RejectExpense;

public record RejectExpenseCommand(Guid ExpenseId) : IRequest;

public class RejectExpenseCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<RejectExpenseCommand>
{
    public async Task Handle(RejectExpenseCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken);

        if (expense is null)
            throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (expense.Status != VerificationStatus.Pending)
            return;

        expense.Reject();
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisExpenseVerified(expense.GhostListId, new NemesisExpenseVerifiedNotification(
            expense.Id,
            expense.GhostListId,
            expense.Status,
            string.Empty));
    }
}
