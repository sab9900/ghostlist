using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralImage;

/// <summary>
/// Relays an encrypted image blob live to everyone else connected to the
/// list, and additionally persists it (TTL-bound, see
/// <c>DeleteExpiredImageBlobsCommand</c>) so devices that weren't connected
/// at send-time can still fetch it later. Pairs with a regular placeholder
/// <c>GhostChatMessage</c> (sent separately via the normal chat pipeline) so
/// the image has a place in the chat history and supports replies — only the
/// stored image blob is temporary/ephemeral.
/// </summary>
public record RelayEphemeralImageCommand(
    Guid ListId,
    Guid MessageId,
    string EncryptedImage,
    string ImageInitializationVector,
    string SenderConnectionId) : IRequest;

public class RelayEphemeralImageCommandValidator : AbstractValidator<RelayEphemeralImageCommand>
{
    public RelayEphemeralImageCommandValidator()
    {
        RuleFor(x => x.ListId).NotEmpty();
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedImage)
            .NotEmpty()
            .MaximumLength(3_500_000);

        RuleFor(x => x.ImageInitializationVector).NotEmpty();
    }
}

public class RelayEphemeralImageCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralImageCommand>
{
    public async Task Handle(RelayEphemeralImageCommand request, CancellationToken cancellationToken)
    {
        try
        {
            var alreadyStored = await context.GhostMessageImages
                .AnyAsync(i => i.Id == request.MessageId, cancellationToken);

            if (!alreadyStored)
            {
                context.GhostMessageImages.Add(GhostMessageImage.Create(
                    request.MessageId,
                    request.ListId,
                    request.EncryptedImage,
                    request.ImageInitializationVector));

                await context.SaveChangesAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            // The owning GhostChatMessage may not be visible yet (race with
            // its own insert) or may already have been deleted. Persistence
            // is best-effort — the live relay below still goes out.
        }

        await notifier.NotifyImageShared(request.ListId, new ImageRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedImage,
            request.ImageInitializationVector,
            request.SenderConnectionId));
    }
}
