namespace GhostList.Domain.Entities;

public class DeviceSubscription
{
    public string DeviceToken { get; private set; } = default!;
    public Guid ListId { get; private set; }
    public DateTime RegisteredAt { get; private set; }

    private DeviceSubscription() { }

    public static DeviceSubscription Create(string deviceToken, Guid listId) => new()
    {
        DeviceToken = deviceToken,
        ListId = listId,
        RegisteredAt = DateTime.UtcNow,
    };
}
