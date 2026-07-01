namespace GhostList.Domain.Entities;

public class DeviceSubscription
{

    public string DeviceId { get; private set; } = default!;

    public Guid ListId { get; private set; }

    public string DeviceToken { get; private set; } = default!;

    public DevicePlatform Platform { get; private set; }

    public bool NotifyOnMessage { get; private set; }

    public bool NotifyOnItemsChanged { get; private set; }

    public bool NotifyOnLethe { get; private set; }

    public bool NotifyOnCharon { get; private set; }

    public bool NotifyOnNemesis { get; private set; }

    public string? Locale { get; private set; }

    public string? UserId { get; private set; }

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
        bool notifyOnLethe = true,
        bool notifyOnCharon = true,
        bool notifyOnNemesis = true,
        string? locale = null,
        string? userId = null) => new()
    {
        DeviceId = deviceId,
        ListId = listId,
        DeviceToken = deviceToken,
        Platform = platform,
        NotifyOnMessage = notifyOnMessage,
        NotifyOnItemsChanged = notifyOnItemsChanged,
        NotifyOnLethe = notifyOnLethe,
        NotifyOnCharon = notifyOnCharon,
        NotifyOnNemesis = notifyOnNemesis,
        Locale = locale,
        UserId = userId,
        RegisteredAt = DateTime.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    public void UpdateUserId(string? userId)
    {
        UserId = userId;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdateToken(string deviceToken, DevicePlatform platform, string? locale = null)
    {
        DeviceToken = deviceToken;
        Platform = platform;
        if (locale is not null) Locale = locale;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdatePreferences(bool notifyOnMessage, bool notifyOnItemsChanged, bool notifyOnLethe, bool notifyOnCharon, bool notifyOnNemesis)
    {
        NotifyOnMessage = notifyOnMessage;
        NotifyOnItemsChanged = notifyOnItemsChanged;
        NotifyOnLethe = notifyOnLethe;
        NotifyOnCharon = notifyOnCharon;
        NotifyOnNemesis = notifyOnNemesis;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
