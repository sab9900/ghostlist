using System;

namespace GhostList.Domain.Entities;

/// <summary>
/// A "burn after read" drop: an end-to-end encrypted blob (image or generic
/// file) shared in a list's Charon tab. Unlike <see cref="GhostMessageImage"/>
/// (which is TTL-bound), a <see cref="CharonDrop"/> is removed as soon as
/// every other current member of the list has viewed it once — see
/// <see cref="CharonViewReceipt"/> and <c>MarkCharonDropViewedCommand</c>.
/// A time-based safety net (<c>DeleteExpiredCharonDropsCommand</c>) also
/// removes drops that nobody ever picked up.
/// </summary>
public class CharonDrop
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }

    /// <summary>AES-GCM ciphertext of the file content (as a data URL), encrypted with the list key.</summary>
    public string EncryptedContent { get; private set; } = null!;
    public string ContentInitializationVector { get; private set; } = null!;

    /// <summary>AES-GCM ciphertext of a small JSON blob (e.g. file name, mime type, size), encrypted with the list key.</summary>
    public string EncryptedMetadata { get; private set; } = null!;
    public string MetadataInitializationVector { get; private set; } = null!;

    public DateTime CreatedAt { get; private set; }

    /// <summary>Id of the device that sent this drop. Excluded from the "everyone must view it" check.</summary>
    public string? SenderDeviceId { get; private set; }

    /// <summary>Stable "person" identity of whoever sent this drop. See <see cref="GhostChatMessage.SenderUserId"/>.</summary>
    public string? SenderUserId { get; private set; }

    private CharonDrop() { }

    public static CharonDrop Create(
        Guid ghostListId,
        string encryptedContent,
        string contentInitializationVector,
        string encryptedMetadata,
        string metadataInitializationVector,
        string? senderDeviceId = null,
        string? senderUserId = null)
    {
        return new CharonDrop
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedContent = encryptedContent,
            ContentInitializationVector = contentInitializationVector,
            EncryptedMetadata = encryptedMetadata,
            MetadataInitializationVector = metadataInitializationVector,
            CreatedAt = DateTime.UtcNow,
            SenderDeviceId = senderDeviceId,
            SenderUserId = senderUserId,
        };
    }
}
