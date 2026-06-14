using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.Whisper.Commands.SendWhisperInvite;

/// <summary>
/// Sends a "come watch now" Whisper invite push notification for a list.
/// If <paramref name="TargetDeviceIds"/> is null or empty, every other
/// subscribed device on the list is notified; otherwise only the listed
/// devices are.
/// </summary>
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
