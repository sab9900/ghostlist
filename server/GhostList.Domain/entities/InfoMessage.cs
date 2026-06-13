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
    public DateTime CreatedAt { get; private set; }

    private InfoMessage() { }

    public static InfoMessage Create(InfoMessageType type, string title, string body)
    {
        return new InfoMessage
        {
            Id = Guid.NewGuid(),
            Type = type,
            Title = title,
            Body = body,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
