using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.ConfirmReceivedSettlement;

public record ConfirmReceivedSettlementCommand(
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    string? ReceiverDeviceId = null,
    string? ReceiverUserId = null,
    string? PayerUserId = null) : IRequest<Guid>;

public class ConfirmReceivedSettlementCommandValidator : AbstractValidator<ConfirmReceivedSettlementCommand>
{
    public ConfirmReceivedSettlementCommandValidator()
    {
        RuleFor(x => x.GhostListId).NotEmpty();
        RuleFor(x => x.EncryptedPayload).NotEmpty().MaximumLength(4_000);
        RuleFor(x => x.PayloadInitializationVector).NotEmpty();
    }
}

public class ConfirmReceivedSettlementCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<ConfirmReceivedSettlementCommand, Guid>
{
    public async Task<Guid> Handle(ConfirmReceivedSettlementCommand request, CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.GhostListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(Domain.Entities.GhostList), request.GhostListId);

        var settlement = NemesisSettlement.CreateConfirmedByReceiver(
            request.GhostListId,
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            request.PayerUserId,
            request.ReceiverUserId);

        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyNemesisSettlementCreated(request.GhostListId, new NemesisSettlementCreatedNotification(
            settlement.Id,
            settlement.GhostListId,
            settlement.EncryptedPayload,
            settlement.PayloadInitializationVector,
            settlement.IsPaidByPayer,
            settlement.IsConfirmedByReceiver,
            settlement.PaidAt,
            settlement.PayerDeviceId,
            settlement.PayerUserId));

        if (settlement.PayerUserId is not null)
        {
            IReadOnlyList<string> payerTargets = [settlement.PayerUserId];
            _ = push.SendNotificationAsync(request.GhostListId, PushNotificationType.NemesisSettlementUpdate, request.ReceiverDeviceId, cancellationToken, targetUserIds: payerTargets)
                     .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);
        }

        return settlement.Id;
    }
}
