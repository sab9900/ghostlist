namespace GhostList.Domain.Entities;

public class DeviceSubscription
{
    /// <summary>Stable client-generated device UUID (same one used for GhostListMember).</summary>
    public string DeviceId { get; private set; } = default!;

    public Guid ListId { get; private set; }

    /// <summary>Push registration token (FCM). Rotates over time — DeviceId is the stable identity.</summary>
    public string DeviceToken { get; private set; } = default!;

    public DevicePlatform Platform { get; private set; }

    /// <summary>Whether this device wants a push when a new chat message arrives in this list.</summary>
    public bool NotifyOnMessage { get; private set; }

    /// <summary>Whether this device wants a push when items in this list change (added/checked/removed).</summary>
    public bool NotifyOnItemsChanged { get; private set; }

    public DateTime RegisteredAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    private DeviceSubscription() { }

    public static DeviceSubscription Create(
        string deviceId,
        Guid listId,
        string deviceToken,
        DevicePlatform platform,
        bool notifyOnMessage = true,
        bool notifyOnItemsChanged = true) => new()
    {
        DeviceId = deviceId,
        ListId = listId,
        DeviceToken = deviceToken,
        Platform = platform,
        NotifyOnMessage = notifyOnMessage,
        NotifyOnItemsChanged = notifyOnItemsChanged,
        RegisteredAt = DateTime.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    /// <summary>Refresh the push token (e.g. after FCM token rotation) and platform.</summary>
    public void UpdateToken(string deviceToken, DevicePlatform platform)
    {
        DeviceToken = deviceToken;
        Platform = platform;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdatePreferences(bool notifyOnMessage, bool notifyOnItemsChanged)
    {
        NotifyOnMessage = notifyOnMessage;
        NotifyOnItemsChanged = notifyOnItemsChanged;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
