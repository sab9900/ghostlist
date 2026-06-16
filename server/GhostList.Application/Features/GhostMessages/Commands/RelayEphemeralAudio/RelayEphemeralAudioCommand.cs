using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralAudio;

public record RelayEphemeralAudioCommand(
    Guid ListId,
    Guid MessageId,
    string EncryptedAudio,
    string AudioInitializationVector,
    string SenderConnectionId) : IRequest;

public class RelayEphemeralAudioCommandValidator : AbstractValidator<RelayEphemeralAudioCommand>
{
    public RelayEphemeralAudioCommandValidator()
    {
        RuleFor(x => x.ListId).NotEmpty();
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedAudio)
            .NotEmpty()
            .MaximumLength(14_000_000); // ~10 MB base64-encoded audio

        RuleFor(x => x.AudioInitializationVector).NotEmpty();
    }
}

public class RelayEphemeralAudioCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralAudioCommand>
{
    public async Task Handle(RelayEphemeralAudioCommand request, CancellationToken cancellationToken)
    {
        try
        {
            var alreadyStored = await context.GhostMessageAudios
                .AnyAsync(a => a.Id == request.MessageId, cancellationToken);

            if (!alreadyStored)
            {
                context.GhostMessageAudios.Add(GhostMessageAudio.Create(
                    request.MessageId,
                    request.ListId,
                    request.EncryptedAudio,
                    request.AudioInitializationVector));

                await context.SaveChangesAsync(cancellationToken);
            }
        }
        catch (DbUpdateException)
        {
            // Race condition: another request stored it first — continue to relay.
        }

        await notifier.NotifyAudioShared(request.ListId, new AudioRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedAudio,
            request.AudioInitializationVector,
            request.SenderConnectionId));
    }
}
