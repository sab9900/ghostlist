namespace GhostList.Application.Common.Interfaces;

/// <summary>
/// One entry in a whisper room's presence roster. <see cref="DisplayName"/> is
/// plaintext supplied by the client when joining — the server cannot decrypt
/// names (it has no key), so it simply relays whatever the client reports.
/// </summary>
public record WhisperPresenceEntry(string DeviceId, string DisplayName);

/// <summary>
/// In-memory, per-process tracker for who currently has the "Whisper" tab of a
/// given list open. Purely ephemeral — nothing here is persisted, and on
/// restart every client re-joins via <see cref="Join"/>.
/// </summary>
public interface IWhisperPresenceTracker
{
    /// <summary>
    /// Registers that <paramref name="connectionId"/> (device <paramref name="deviceId"/>,
    /// display name <paramref name="displayName"/>) is now viewing the whisper
    /// room for <paramref name="listId"/>. Returns the updated roster for that room.
    /// </summary>
    IReadOnlyList<WhisperPresenceEntry> Join(string listId, string connectionId, string deviceId, string displayName);

    /// <summary>
    /// Registers that <paramref name="connectionId"/> left the whisper room for
    /// <paramref name="listId"/>. Returns the updated roster for that room.
    /// </summary>
    IReadOnlyList<WhisperPresenceEntry> Leave(string listId, string connectionId);

    /// <summary>
    /// Cleans up all whisper presence state for a closed connection. If the
    /// connection was in a whisper room, returns that room's id and updated
    /// roster so callers can notify remaining members; otherwise null.
    /// </summary>
    (string ListId, IReadOnlyList<WhisperPresenceEntry> Roster)? RemoveConnection(string connectionId);

    /// <summary>
    /// Returns the current roster of devices viewing the whisper room for
    /// <paramref name="listId"/>, without modifying any state.
    /// </summary>
    IReadOnlyList<WhisperPresenceEntry> GetRoster(string listId);
}
