namespace GhostList.Domain.Entities;

public class InfoMessage
{
    public Guid Id { get; private set; }
    public InfoMessageType Type { get; private set; }
    public string Title { get; private set; } = null!;
    public string Body { get; private set; } = null!;

    public DevicePlatform? TargetPlatform { get; private set; }

    public string? Version { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private InfoMessage() { }

    public static InfoMessage Create(InfoMessageType type, string title, string body, DevicePlatform? targetPlatform = null, string? version = null)
    {
        return new InfoMessage
        {
            Id = Guid.NewGuid(),
            Type = type,
            Title = title,
            Body = body,
            TargetPlatform = targetPlatform,
            Version = version,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
