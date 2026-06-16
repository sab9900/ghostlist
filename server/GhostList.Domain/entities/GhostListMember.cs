namespace GhostList.Domain.Entities;

public class GhostListMember
{
    public Guid Id { get; set; }
    public Guid GhostListId { get; set; }

    public string DeviceId { get; set; } = string.Empty;

    public string? UserId { get; set; }

    public string EncryptedPayload { get; set; } = string.Empty;

    public string InitializationVector { get; set; } = string.Empty;

    public DateTimeOffset UpdatedAt { get; set; }

    public DateTimeOffset? LastReadMessageAt { get; set; }

    public DateTimeOffset? LastReadItemAt { get; set; }
}
