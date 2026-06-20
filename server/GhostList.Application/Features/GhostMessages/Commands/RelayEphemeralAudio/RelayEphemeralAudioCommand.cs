using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;

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
            .MaximumLength(14_000_000);

        RuleFor(x => x.AudioInitializationVector).NotEmpty();
    }
}

public class RelayEphemeralAudioCommandHandler(IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralAudioCommand>
{
    public Task Handle(RelayEphemeralAudioCommand request, CancellationToken cancellationToken)
        => notifier.NotifyAudioShared(request.ListId, new AudioRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedAudio,
            request.AudioInitializationVector,
            request.SenderConnectionId));
}
