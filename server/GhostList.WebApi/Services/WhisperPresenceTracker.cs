using System.Collections.Concurrent;
using GhostList.Application.Common.Interfaces;

namespace GhostList.WebApi.Services;

/// <summary>
/// In-memory, singleton tracker for "who is currently looking at the Whisper
/// tab" per list. A connection can be in at most one whisper room at a time.
/// State only needs to be correct for the current process — on restart every
/// client reconnects and re-joins.
/// </summary>
public class WhisperPresenceTracker : IWhisperPresenceTracker
{
    private sealed class ConnectionInfo
    {
        public required string ListId { get; init; }
        public required WhisperPresenceEntry Entry { get; init; }
    }

    private readonly object _lock = new();

    // connectionId -> which whisper room it's in (and its presence entry)
    private readonly ConcurrentDictionary<string, ConnectionInfo> _connections = new();

    // listId -> connectionId -> presence entry
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, WhisperPresenceEntry>> _rooms = new();

    public IReadOnlyList<WhisperPresenceEntry> Join(string listId, string connectionId, string deviceId, string displayName)
    {
        lock (_lock)
        {
            // A connection can only watch one whisper room at a time — if it
            // was already in a different one, leave it first.
            if (_connections.TryGetValue(connectionId, out var existing) && existing.ListId != listId)
            {
                RemoveFromRoom(existing.ListId, connectionId);
            }

            var entry = new WhisperPresenceEntry(deviceId, displayName);
            _connections[connectionId] = new ConnectionInfo { ListId = listId, Entry = entry };

            var room = _rooms.GetOrAdd(listId, _ => new ConcurrentDictionary<string, WhisperPresenceEntry>());
            room[connectionId] = entry;

            return Roster(listId);
        }
    }

    public IReadOnlyList<WhisperPresenceEntry> Leave(string listId, string connectionId)
    {
        lock (_lock)
        {
            _connections.TryRemove(connectionId, out _);
            RemoveFromRoom(listId, connectionId);
            return Roster(listId);
        }
    }

    public (string ListId, IReadOnlyList<WhisperPresenceEntry> Roster)? RemoveConnection(string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.TryRemove(connectionId, out var connection))
                return null;

            RemoveFromRoom(connection.ListId, connectionId);
            return (connection.ListId, Roster(connection.ListId));
        }
    }

    /// <summary>Must be called while holding <see cref="_lock"/>.</summary>
    private void RemoveFromRoom(string listId, string connectionId)
    {
        if (!_rooms.TryGetValue(listId, out var room))
            return;

        room.TryRemove(connectionId, out _);
        if (room.IsEmpty)
        {
            _rooms.TryRemove(listId, out _);
        }
    }

    public IReadOnlyList<WhisperPresenceEntry> GetRoster(string listId)
    {
        lock (_lock)
        {
            return Roster(listId);
        }
    }

    /// <summary>Must be called while holding <see cref="_lock"/>.</summary>
    private IReadOnlyList<WhisperPresenceEntry> Roster(string listId) =>
        _rooms.TryGetValue(listId, out var room) ? room.Values.ToList() : [];
}
