using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.SubmitSettlement;

public record SubmitSettlementCommand(
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    string? PayerDeviceId = null,
    string? PayerUserId = null,
    string? ReceiverUserId = null) : IRequest<Guid>;

public class SubmitSettlementCommandValidator : AbstractValidator<SubmitSettlementCommand>
{
    public SubmitSettlementCommandValidator()
    {
        RuleFor(x => x.GhostListId).NotEmpty();
        RuleFor(x => x.EncryptedPayload).NotEmpty().MaximumLength(4_000);
        RuleFor(x => x.PayloadInitializationVector).NotEmpty();
    }
}

public class SubmitSettlementCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<SubmitSettlementCommand, Guid>
{
    public async Task<Guid> Handle(SubmitSettlementCommand request, CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.GhostListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(Domain.Entities.GhostList), request.GhostListId);

        var settlement = NemesisSettlement.Create(
            request.GhostListId,
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            request.PayerDeviceId,
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

        IReadOnlyList<string>? receiverTargets = request.ReceiverUserId is not null ? [request.ReceiverUserId] : null;
        _ = push.SendNotificationAsync(request.GhostListId, PushNotificationType.NemesisUpdate, request.PayerDeviceId, cancellationToken, targetUserIds: receiverTargets)
                 .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);

        return settlement.Id;
    }
}
