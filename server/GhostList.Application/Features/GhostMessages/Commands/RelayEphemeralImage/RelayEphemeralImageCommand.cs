using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralImage;

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

public class RelayEphemeralImageCommandHandler(IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralImageCommand>
{
    public Task Handle(RelayEphemeralImageCommand request, CancellationToken cancellationToken)
        => notifier.NotifyImageShared(request.ListId, new ImageRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedImage,
            request.ImageInitializationVector,
            request.SenderConnectionId));
}
