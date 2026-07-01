using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.CreateExpense;

public record CreateExpenseCommand(
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    int SplitCount,
    string? CreatedByDeviceId = null,
    string? CreatedByUserId = null,
    IReadOnlyList<string>? SplitBetweenUserIds = null) : IRequest<Guid>;

public class CreateExpenseCommandValidator : AbstractValidator<CreateExpenseCommand>
{
    public CreateExpenseCommandValidator()
    {
        RuleFor(x => x.GhostListId).NotEmpty();
        RuleFor(x => x.EncryptedPayload).NotEmpty().MaximumLength(4_000);
        RuleFor(x => x.PayloadInitializationVector).NotEmpty();
        RuleFor(x => x.SplitCount).GreaterThanOrEqualTo(0);
    }
}

public class CreateExpenseCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<CreateExpenseCommand, Guid>
{
    public async Task<Guid> Handle(CreateExpenseCommand request, CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.GhostListId, cancellationToken);

        if (!listExists)
            throw new Common.Exceptions.NotFoundException(nameof(Domain.Entities.GhostList), request.GhostListId);

        var expense = NemesisExpense.Create(
            request.GhostListId,
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            request.SplitCount,
            request.CreatedByDeviceId,
            request.CreatedByUserId);

        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync(cancellationToken);

        var verifications = new List<NemesisExpenseVerificationRecord>();

        await notifier.NotifyNemesisExpenseCreated(request.GhostListId, new NemesisExpenseCreatedNotification(
            expense.Id,
            expense.GhostListId,
            expense.EncryptedPayload,
            expense.PayloadInitializationVector,
            expense.Status,
            expense.SplitCount,
            expense.CreatedAt,
            expense.CreatedByDeviceId,
            expense.CreatedByUserId,
            null,
            null,
            verifications));

        IReadOnlyList<string>? splitTargets = request.SplitBetweenUserIds is { Count: > 0 } ? request.SplitBetweenUserIds : null;
        _ = push.SendNotificationAsync(request.GhostListId, PushNotificationType.NemesisUpdate, request.CreatedByDeviceId, cancellationToken, targetUserIds: splitTargets)
                 .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);

        return expense.Id;
    }
}
