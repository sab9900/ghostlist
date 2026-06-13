namespace GhostList.Application.Common.Interfaces;

/// <summary>
/// Tracks, per SignalR connection, which list "rooms" a device is currently
/// watching and whether the app is in the foreground at all. Used to suppress
/// push notifications for devices that are already looking at the relevant
/// content.
/// </summary>
public interface IPresenceTracker
{
    /// <summary>Registers that <paramref name="connectionId"/> (belonging to <paramref name="deviceId"/>) joined the room for <paramref name="listId"/>.</summary>
    void JoinList(string connectionId, string listId, string deviceId);

    /// <summary>Registers that <paramref name="connectionId"/> left the room for <paramref name="listId"/>.</summary>
    void LeaveList(string connectionId, string listId);

    /// <summary>Updates the app-wide foreground status for <paramref name="deviceId"/>.</summary>
    void SetForeground(string connectionId, string deviceId, bool isForeground);

    /// <summary>Cleans up all presence state associated with a closed connection.</summary>
    void RemoveConnection(string connectionId);

    /// <summary>True if any connection for <paramref name="deviceId"/> currently has the room for <paramref name="listId"/> open.</summary>
    bool IsPresentInList(string listId, string deviceId);

    /// <summary>True if <paramref name="deviceId"/> has reported the app as being in the foreground.</summary>
    bool IsForeground(string deviceId);

    /// <summary>True if a push notification for <paramref name="listId"/> should be suppressed for <paramref name="deviceId"/> — i.e. the device has the list open or the app in the foreground.</summary>
    bool ShouldSuppress(string listId, string deviceId);
}
