namespace GhostList.Domain.Entities;

public class GhostListMember
{
    public Guid Id { get; set; }
    public Guid GhostListId { get; set; }

    /// <summary>Client-generated stable device UUID. Used as the deduplication key.</summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Client-generated stable "person" identity (distinct from <see cref="DeviceId"/>),
    /// synced across a person's devices. Used server-side to recognize when an
    /// unread-summary request comes from the same person as the message/item sender,
    /// even if the request comes from a different device. Plain UUID, not
    /// encrypted — carries no personal information by itself.
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>AES-256-GCM ciphertext of { deviceId, userId, displayName, joinedAt }. Server never decrypts this.</summary>
    public string EncryptedPayload { get; set; } = string.Empty;

    public string InitializationVector { get; set; } = string.Empty;

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>
    /// Timestamp of the newest chat message this device has seen (read receipt).
    /// Plain timestamp only — carries no message content, so it stays
    /// zero-knowledge compatible.
    /// </summary>
    public DateTimeOffset? LastReadMessageAt { get; set; }

    /// <summary>
    /// Timestamp of the newest list item this device has seen (read receipt).
    /// </summary>
    public DateTimeOffset? LastReadItemAt { get; set; }
}
