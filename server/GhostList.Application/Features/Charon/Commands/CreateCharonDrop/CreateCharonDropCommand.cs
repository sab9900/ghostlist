using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.CreateCharonDrop;

/// <summary>
/// Creates a new Charon "dead drop": an encrypted blob (image or generic
/// file, plus encrypted filename/mimetype/size metadata) that is persisted
/// until every other member of the list has viewed it once
/// (see <c>MarkCharonDropViewedCommand</c>), or until it expires unread
/// (see <c>DeleteExpiredCharonDropsCommand</c>).
/// </summary>
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

public class CreateCharonDropCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
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
            request.EncryptedContent,
            request.ContentInitializationVector,
            request.EncryptedMetadata,
            request.MetadataInitializationVector,
            request.SenderDeviceId,
            request.SenderUserId);

        context.CharonDrops.Add(drop);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyCharonDropCreated(drop.GhostListId, new CharonDropCreatedNotification(
            drop.Id,
            drop.GhostListId,
            drop.EncryptedContent,
            drop.ContentInitializationVector,
            drop.EncryptedMetadata,
            drop.MetadataInitializationVector,
            drop.CreatedAt,
            drop.SenderDeviceId,
            drop.SenderUserId));

        return drop.Id;
    }
}
