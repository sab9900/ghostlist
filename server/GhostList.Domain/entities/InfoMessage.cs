namespace GhostList.Domain.Entities;

/// <summary>
/// An announcement authored by an admin (release notes, maintenance windows, etc.)
/// and broadcast to every standard client. Unlike list data, this content is
/// plain text by design — it comes from the operator, not from end users, so
/// the zero-knowledge model doesn't apply here.
/// </summary>
public class InfoMessage
{
    public Guid Id { get; private set; }
    public InfoMessageType Type { get; private set; }
    public string Title { get; private set; } = null!;
    public string Body { get; private set; } = null!;

    /// <summary>
    /// If set, the message is only shown on clients running this platform
    /// (e.g. an Android release announcement). Null means "all platforms".
    /// </summary>
    public DevicePlatform? TargetPlatform { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private InfoMessage() { }

    public static InfoMessage Create(InfoMessageType type, string title, string body, DevicePlatform? targetPlatform = null)
    {
        return new InfoMessage
        {
            Id = Guid.NewGuid(),
            Type = type,
            Title = title,
            Body = body,
            TargetPlatform = targetPlatform,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
