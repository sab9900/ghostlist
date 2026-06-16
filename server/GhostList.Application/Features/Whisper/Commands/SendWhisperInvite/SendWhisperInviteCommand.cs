using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.Whisper.Commands.SendWhisperInvite;

public record SendWhisperInviteCommand(Guid ListId, string SenderDeviceId, IReadOnlyList<string>? TargetDeviceIds) : IRequest;

public class SendWhisperInviteCommandHandler(IPushNotificationService push) : IRequestHandler<SendWhisperInviteCommand>
{
    public async Task Handle(SendWhisperInviteCommand request, CancellationToken cancellationToken)
    {
        await push.SendNotificationAsync(
            request.ListId,
            PushNotificationType.WhisperInvite,
            request.SenderDeviceId,
            cancellationToken,
            request.TargetDeviceIds);
    }
}
