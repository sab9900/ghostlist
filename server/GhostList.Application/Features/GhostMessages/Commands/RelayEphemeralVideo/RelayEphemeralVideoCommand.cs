using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralVideo;

public record RelayEphemeralVideoCommand(
    Guid ListId,
    Guid MessageId,
    string EncryptedVideo,
    string VideoInitializationVector,
    string SenderConnectionId) : IRequest;

public class RelayEphemeralVideoCommandValidator : AbstractValidator<RelayEphemeralVideoCommand>
{
    public RelayEphemeralVideoCommandValidator()
    {
        RuleFor(x => x.ListId).NotEmpty();
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedVideo)
            .NotEmpty()
            .MaximumLength(28_000_000);

        RuleFor(x => x.VideoInitializationVector).NotEmpty();
    }
}

public class RelayEphemeralVideoCommandHandler(IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralVideoCommand>
{
    public Task Handle(RelayEphemeralVideoCommand request, CancellationToken cancellationToken)
        => notifier.NotifyVideoShared(request.ListId, new VideoRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedVideo,
            request.VideoInitializationVector,
            request.SenderConnectionId));
}
