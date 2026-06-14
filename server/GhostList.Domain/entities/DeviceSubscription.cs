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

    /// <summary>
    /// Client UI language at registration time (e.g. "en_US", "de_DE"), used to pick the
    /// language of push notification text. Matches LanguageService.SUPPORTED on the client.
    /// Null for older subscriptions registered before this field existed — treated as the
    /// fallback language when sending.
    /// </summary>
    public string? Locale { get; private set; }

    public DateTime RegisteredAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    private DeviceSubscription() { }

    public static DeviceSubscription Create(
        string deviceId,
        Guid listId,
        string deviceToken,
        DevicePlatform platform,
        bool notifyOnMessage = true,
        bool notifyOnItemsChanged = false,
        string? locale = null) => new()
    {
        DeviceId = deviceId,
        ListId = listId,
        DeviceToken = deviceToken,
        Platform = platform,
        NotifyOnMessage = notifyOnMessage,
        NotifyOnItemsChanged = notifyOnItemsChanged,
        Locale = locale,
        RegisteredAt = DateTime.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    /// <summary>Refresh the push token (e.g. after FCM token rotation), platform, and locale.</summary>
    public void UpdateToken(string deviceToken, DevicePlatform platform, string? locale = null)
    {
        DeviceToken = deviceToken;
        Platform = platform;
        if (locale is not null) Locale = locale;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdatePreferences(bool notifyOnMessage, bool notifyOnItemsChanged)
    {
        NotifyOnMessage = notifyOnMessage;
        NotifyOnItemsChanged = notifyOnItemsChanged;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
