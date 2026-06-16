namespace GhostList.Application.Common.Interfaces;

public enum PushNotificationType
{

    Message,

    ItemsChanged,

    WhisperInvite,

    CharonDrop,

    ItemReminder,
}

public interface IPushNotificationService
{

    Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct, IReadOnlyCollection<string>? targetDeviceIds = null);
}
