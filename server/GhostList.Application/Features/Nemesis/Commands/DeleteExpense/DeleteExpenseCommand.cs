using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.DeleteExpense;

public record DeleteExpenseCommand(Guid ExpenseId, string? RequestingUserId) : IRequest;

public class DeleteExpenseCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IBlobStorage blobStorage)
    : IRequestHandler<DeleteExpenseCommand>
{
    public async Task Handle(DeleteExpenseCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .Include(e => e.Verifications)
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (string.IsNullOrWhiteSpace(request.RequestingUserId) || expense.CreatedByUserId != request.RequestingUserId)
            throw new ForbiddenException("Only the creator can delete this expense.");

        var listId = expense.GhostListId;
        var receiptBlobKey = expense.ReceiptBlobKey;

        context.NemesisVerifications.RemoveRange(expense.Verifications);
        context.NemesisExpenses.Remove(expense);
        await context.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(receiptBlobKey))
        {
            try
            {
                await blobStorage.DeleteAsync(receiptBlobKey, cancellationToken);
            }
            catch
            {
            }
        }

        await notifier.NotifyNemesisExpenseDeleted(listId, new NemesisExpenseDeletedNotification(request.ExpenseId, listId));
    }
}
