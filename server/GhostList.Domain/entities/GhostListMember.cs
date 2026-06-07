namespace GhostList.Domain.Entities;

public class GhostListMember
{
    public Guid Id { get; set; }
    public Guid GhostListId { get; set; }

    /// <summary>Client-generated stable device UUID. Used as the deduplication key.</summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>AES-256-GCM ciphertext of { deviceId, displayName, joinedAt }. Server never decrypts this.</summary>
    public string EncryptedPayload { get; set; } = string.Empty;

    public string InitializationVector { get; set; } = string.Empty;

    public DateTimeOffset UpdatedAt { get; set; }
}
