using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.ArchiveExpense;

public record ArchiveExpenseCommand(Guid ExpenseId) : IRequest;

public class ArchiveExpenseCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<ArchiveExpenseCommand>
{
    public async Task Handle(ArchiveExpenseCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken);

        if (expense is null)
            throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (expense.IsArchived)
            return;

        expense.Archive();
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisExpenseArchived(expense.GhostListId, new NemesisExpenseArchivedNotification(
            expense.Id,
            expense.GhostListId));
    }
}
