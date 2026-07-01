using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.VerifyExpense;

public record VerifyExpenseCommand(
    Guid ExpenseId,
    string VerifiedByUserId) : IRequest;

public class VerifyExpenseCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<VerifyExpenseCommand>
{
    public async Task Handle(VerifyExpenseCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .Include(e => e.Verifications)
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken);

        if (expense is null)
            throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (expense.Status != VerificationStatus.Pending ||
            expense.Verifications.Any(v => v.VerifiedByUserId == request.VerifiedByUserId))
            return;

        expense.AddVerification(request.VerifiedByUserId);

        var newVerification = expense.Verifications.First(v => v.VerifiedByUserId == request.VerifiedByUserId);
        context.NemesisVerifications.Add(newVerification);

        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            return;
        }

        await notifier.NotifyNemesisExpenseVerified(expense.GhostListId, new NemesisExpenseVerifiedNotification(
            expense.Id,
            expense.GhostListId,
            expense.Status,
            request.VerifiedByUserId));

        if (expense.Status == VerificationStatus.Verified && expense.CreatedByUserId is not null)
        {
            IReadOnlyList<string> payerTargets = [expense.CreatedByUserId];
            _ = push.SendNotificationAsync(expense.GhostListId, PushNotificationType.NemesisUpdate, null, cancellationToken, targetUserIds: payerTargets)
                     .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }
    }
}
