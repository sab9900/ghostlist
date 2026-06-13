using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralImage;

/// <summary>
/// Relays an encrypted image blob live to everyone else connected to the
/// list, without ever writing it to the database. Pairs with a regular
/// placeholder <c>GhostChatMessage</c> (sent separately via the normal chat
/// pipeline) so the image has a place in the chat history and supports
/// replies — only the actual image bytes are ephemeral.
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

public class RelayEphemeralImageCommandHandler(IGhostListNotifier notifier)
    : IRequestHandler<RelayEphemeralImageCommand>
{
    public Task Handle(RelayEphemeralImageCommand request, CancellationToken cancellationToken)
    {
        return notifier.NotifyImageShared(request.ListId, new ImageRelayNotification(
            request.MessageId,
            request.ListId,
            request.EncryptedImage,
            request.ImageInitializationVector,
            request.SenderConnectionId));
    }
}
