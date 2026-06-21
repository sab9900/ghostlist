using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.Whisper.Commands.SendWhisperInvite;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Whisper;

public class SendWhisperInviteCommandHandlerTests
{
    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(
            Arg.Any<Guid>(),
            Arg.Any<PushNotificationType>(),
            Arg.Any<string?>(),
            Arg.Any<CancellationToken>(),
            Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyWhisperInviteReceived(Arg.Any<Guid>(), Arg.Any<string?>(), Arg.Any<IReadOnlyList<string>?>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ValidRequest_SendsPushNotification()
    {
        var push = MockPush();
        var handler = new SendWhisperInviteCommandHandler(push, MockNotifier());
        var listId = Guid.NewGuid();

        await handler.Handle(new SendWhisperInviteCommand(listId, "device1", null), CancellationToken.None);

        await push.Received(1).SendNotificationAsync(
            listId, PushNotificationType.WhisperInvite, "device1", Arg.Any<CancellationToken>(), null);
    }

    [Fact]
    public async Task Handle_ValidRequest_NotifiesWhisperInviteReceived()
    {
        var notifier = MockNotifier();
        var handler = new SendWhisperInviteCommandHandler(MockPush(), notifier);
        var listId = Guid.NewGuid();
        var targets = new List<string> { "deviceA", "deviceB" };

        await handler.Handle(new SendWhisperInviteCommand(listId, "device1", targets), CancellationToken.None);

        await notifier.Received(1).NotifyWhisperInviteReceived(listId, "device1", targets);
    }
}
