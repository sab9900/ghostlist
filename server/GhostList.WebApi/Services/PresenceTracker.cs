using System.Collections.Concurrent;
using GhostList.Application.Common.Interfaces;

namespace GhostList.WebApi.Services;

/// <summary>
/// In-memory, singleton presence tracker. State only needs to be correct for
/// the current process — if the app restarts, every client reconnects and
/// re-reports its presence (JoinListRoom / SetAppState), so nothing needs to
/// be persisted.
/// </summary>
public class PresenceTracker : IPresenceTracker
{
    private sealed class ConnectionInfo
    {
        public required string DeviceId { get; init; }
        public ConcurrentDictionary<string, byte> ListIds { get; } = new();
    }

    private readonly object _lock = new();

    // connectionId -> (deviceId, set of listIds the connection has joined)
    private readonly ConcurrentDictionary<string, ConnectionInfo> _connections = new();

    // listId -> deviceId -> number of connections (for that device) currently in the room
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, int>> _roomPresence = new();

    // deviceId -> whether the app is currently reported as foregrounded
    private readonly ConcurrentDictionary<string, bool> _foreground = new();

    // deviceId -> number of live connections (across all rooms)
    private readonly ConcurrentDictionary<string, int> _deviceConnectionCounts = new();

    public void JoinList(string connectionId, string listId, string deviceId)
    {
        lock (_lock)
        {
            var connection = GetOrRegisterConnection(connectionId, deviceId);
            if (connection.ListIds.TryAdd(listId, 0))
            {
                IncrementRoomPresence(listId, deviceId);
            }
        }
    }

    public void LeaveList(string connectionId, string listId)
    {
        lock (_lock)
        {
            if (_connections.TryGetValue(connectionId, out var connection)
                && connection.ListIds.TryRemove(listId, out _))
            {
                DecrementRoomPresence(listId, connection.DeviceId);
            }
        }
    }

    public void SetForeground(string connectionId, string deviceId, bool isForeground)
    {
        lock (_lock)
        {
            GetOrRegisterConnection(connectionId, deviceId);
            _foreground[deviceId] = isForeground;
        }
    }

    public void RemoveConnection(string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.TryRemove(connectionId, out var connection))
                return;

            foreach (var listId in connection.ListIds.Keys)
            {
                DecrementRoomPresence(listId, connection.DeviceId);
            }

            var remaining = _deviceConnectionCounts.AddOrUpdate(
                connection.DeviceId,
                0,
                (_, count) => Math.Max(0, count - 1));

            if (remaining == 0)
            {
                _deviceConnectionCounts.TryRemove(connection.DeviceId, out _);
                _foreground.TryRemove(connection.DeviceId, out _);
            }
        }
    }

    public bool IsPresentInList(string listId, string deviceId)
        => _roomPresence.TryGetValue(listId, out var devices)
           && devices.TryGetValue(deviceId, out var count)
           && count > 0;

    public bool IsForeground(string deviceId)
        => _foreground.TryGetValue(deviceId, out var isForeground) && isForeground;

    public bool ShouldSuppress(string listId, string deviceId)
        => IsPresentInList(listId, deviceId) || IsForeground(deviceId);

    /// <summary>Must be called while holding <see cref="_lock"/>.</summary>
    private ConnectionInfo GetOrRegisterConnection(string connectionId, string deviceId)
    {
        if (_connections.TryGetValue(connectionId, out var existing))
            return existing;

        var connection = new ConnectionInfo { DeviceId = deviceId };
        _connections[connectionId] = connection;
        _deviceConnectionCounts.AddOrUpdate(deviceId, 1, (_, count) => count + 1);
        return connection;
    }

    /// <summary>Must be called while holding <see cref="_lock"/>.</summary>
    private void IncrementRoomPresence(string listId, string deviceId)
    {
        var devices = _roomPresence.GetOrAdd(listId, _ => new ConcurrentDictionary<string, int>());
        devices.AddOrUpdate(deviceId, 1, (_, count) => count + 1);
    }

    /// <summary>Must be called while holding <see cref="_lock"/>.</summary>
    private void DecrementRoomPresence(string listId, string deviceId)
    {
        if (!_roomPresence.TryGetValue(listId, out var devices))
            return;

        var remaining = devices.AddOrUpdate(deviceId, 0, (_, count) => Math.Max(0, count - 1));
        if (remaining == 0)
        {
            devices.TryRemove(deviceId, out _);
        }

        if (devices.IsEmpty)
        {
            _roomPresence.TryRemove(listId, out _);
        }
    }
}
