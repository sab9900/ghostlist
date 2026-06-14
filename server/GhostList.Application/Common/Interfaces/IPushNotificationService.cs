namespace GhostList.Application.Common.Interfaces;

/// <summary>
/// The push notification types GhostList sends. Kept deliberately generic
/// (no message content) so the server never needs to decrypt anything.
/// </summary>
public enum PushNotificationType
{
    /// <summary>A new chat message was posted to the list.</summary>
    Message,

    /// <summary>An item in the list was added, checked/unchecked, or removed.</summary>
    ItemsChanged,

    /// <summary>Someone is in the Whisper room now and is inviting others to join.</summary>
    WhisperInvite,
}

public interface IPushNotificationService
{
    /// <summary>
    /// Sends a push notification of the given <paramref name="type"/> to every
    /// subscribed device for <paramref name="listId"/>, except:
    /// <list type="bullet">
    /// <item>the device identified by <paramref name="senderDeviceId"/> (the device that triggered the change), if any</item>
    /// <item>devices that have opted out of this notification type for this list</item>
    /// <item>devices that currently have the list open, or have the app in the foreground</item>
    /// </list>
    /// For <see cref="PushNotificationType.WhisperInvite"/>, the notification-preference
    /// opt-out is ignored (an explicit invite always reaches its recipients), devices
    /// already in the live Whisper room are also excluded, and if
    /// <paramref name="targetDeviceIds"/> is non-empty only those devices are notified
    /// (instead of every list member).
    /// </summary>
    Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct, IReadOnlyCollection<string>? targetDeviceIds = null);
}
