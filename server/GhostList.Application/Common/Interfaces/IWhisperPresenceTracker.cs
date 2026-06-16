namespace GhostList.Application.Common.Interfaces;

public record WhisperPresenceEntry(string DeviceId, string DisplayName);

public interface IWhisperPresenceTracker
{

    IReadOnlyList<WhisperPresenceEntry> Join(string listId, string connectionId, string deviceId, string displayName);

    IReadOnlyList<WhisperPresenceEntry> Leave(string listId, string connectionId);

    (string ListId, IReadOnlyList<WhisperPresenceEntry> Roster)? RemoveConnection(string connectionId);

    IReadOnlyList<WhisperPresenceEntry> GetRoster(string listId);
}
