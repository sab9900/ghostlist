using FluentValidation;
using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.CreateCharonDrop;

public record CreateCharonDropCommand(
    Guid GhostListId,
    string EncryptedContent,
    string ContentInitializationVector,
    string EncryptedMetadata,
    string MetadataInitializationVector,
    string? SenderDeviceId = null,
    string? SenderUserId = null) : IRequest<Guid>;

public class CreateCharonDropCommandValidator : AbstractValidator<CreateCharonDropCommand>
{
    public CreateCharonDropCommandValidator()
    {
        RuleFor(x => x.GhostListId).NotEmpty();

        RuleFor(x => x.EncryptedContent)
            .NotEmpty()
            .MaximumLength(15_000_000);

        RuleFor(x => x.ContentInitializationVector).NotEmpty();

        RuleFor(x => x.EncryptedMetadata)
            .NotEmpty()
            .MaximumLength(4_000);

        RuleFor(x => x.MetadataInitializationVector).NotEmpty();
    }
}

public class CreateCharonDropCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage, IGhostListNotifier notifier, IPushNotificationService push)
    : IRequestHandler<CreateCharonDropCommand, Guid>
{
    private const int MaxPendingDropsPerList = 50;

    public async Task<Guid> Handle(CreateCharonDropCommand request, CancellationToken cancellationToken)
    {
        var listExists = await context.GhostLists
            .AnyAsync(gl => gl.Id == request.GhostListId, cancellationToken);

        if (!listExists)
            throw new NotFoundException(nameof(Domain.Entities.GhostList), request.GhostListId);

        var pendingCount = await context.CharonDrops
            .CountAsync(d => d.GhostListId == request.GhostListId, cancellationToken);

        if (pendingCount >= MaxPendingDropsPerList)
            throw new InvalidOperationException("Cannot have more than 50 pending Charon drops in a list.");

        var drop = CharonDrop.Create(
            request.GhostListId,
            request.EncryptedMetadata,
            request.MetadataInitializationVector,
            request.SenderDeviceId,
            request.SenderUserId);

        context.CharonDrops.Add(drop);
        await context.SaveChangesAsync(cancellationToken);

        var contentPayload = $"{request.ContentInitializationVector}:{request.EncryptedContent}";
        await blobStorage.SaveAsync(BlobKeys.CharonDrop(drop.Id), contentPayload, cancellationToken);

        await notifier.NotifyCharonDropCreated(drop.GhostListId, new CharonDropCreatedNotification(
            drop.Id,
            drop.GhostListId,
            request.EncryptedContent,
            request.ContentInitializationVector,
            drop.EncryptedMetadata,
            drop.MetadataInitializationVector,
            drop.CreatedAt,
            drop.SenderDeviceId,
            drop.SenderUserId));

        _ = push.SendNotificationAsync(drop.GhostListId, PushNotificationType.CharonDrop, request.SenderDeviceId, cancellationToken)
                 .ContinueWith(t => { }, TaskContinuationOptions.OnlyOnFaulted);

        return drop.Id;
    }
}
