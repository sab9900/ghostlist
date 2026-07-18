using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.UpdateExpenseSplit;

public record UpdateExpenseSplitCommand(
    Guid ExpenseId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    int SplitCount,
    IReadOnlyList<string>? RemovedUserIds = null) : IRequest;

public class UpdateExpenseSplitCommandValidator : AbstractValidator<UpdateExpenseSplitCommand>
{
    public UpdateExpenseSplitCommandValidator()
    {
        RuleFor(x => x.ExpenseId).NotEmpty();
        RuleFor(x => x.EncryptedPayload).NotEmpty().MaximumLength(4_000);
        RuleFor(x => x.PayloadInitializationVector).NotEmpty();
        RuleFor(x => x.SplitCount).GreaterThanOrEqualTo(0);
    }
}

public class UpdateExpenseSplitCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<UpdateExpenseSplitCommand>
{
    public async Task Handle(UpdateExpenseSplitCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .Include(e => e.Verifications)
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (expense.Status != VerificationStatus.Pending)
            return;

        var removedVerifications = request.RemovedUserIds is { Count: > 0 }
            ? expense.Verifications.Where(v => request.RemovedUserIds.Contains(v.VerifiedByUserId)).ToList()
            : [];

        expense.UpdateSplit(
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            request.SplitCount,
            request.RemovedUserIds);

        if (removedVerifications.Count > 0)
            context.NemesisVerifications.RemoveRange(removedVerifications);

        await context.SaveChangesAsync(cancellationToken);

        var verifications = expense.Verifications
            .Select(v => new NemesisExpenseVerificationRecord(v.VerifiedByUserId, v.VerifiedAt))
            .ToList();

        await notifier.NotifyNemesisExpenseUpdated(expense.GhostListId, new NemesisExpenseUpdatedNotification(
            expense.Id,
            expense.GhostListId,
            expense.EncryptedPayload,
            expense.PayloadInitializationVector,
            expense.Status,
            expense.SplitCount,
            expense.IsArchived,
            expense.CreatedAt,
            expense.CreatedByDeviceId,
            expense.CreatedByUserId,
            expense.EncryptedReceiptKey,
            expense.ReceiptBlobKey,
            verifications));
    }
}
