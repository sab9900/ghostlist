namespace GhostList.Application.Common.Interfaces;

/// <summary>
/// The two push notification types GhostList sends. Kept deliberately generic
/// (no message content) so the server never needs to decrypt anything.
/// </summary>
public enum PushNotificationType
{
    /// <summary>A new chat message was posted to the list.</summary>
    Message,

    /// <summary>An item in the list was added, checked/unchecked, or removed.</summary>
    ItemsChanged,
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
    /// </summary>
    Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct);
}
