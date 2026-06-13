using System;

namespace GhostList.Domain.Entities;

/// <summary>
/// Temporary, encrypted storage for a shared chat image. Mirrors the
/// placeholder <see cref="GhostChatMessage"/> (same <c>Id</c> as the message
/// it belongs to) but holds the actual ciphertext, so clients that weren't
/// connected at send-time can still fetch it within the retention window.
/// Rows are deleted automatically once <see cref="CreatedAt"/> exceeds the
/// cleanup TTL (see <c>DeleteExpiredImageBlobsCommand</c>), and also cascade
/// when the owning <see cref="GhostChatMessage"/> is deleted.
/// </summary>
public class GhostMessageImage
{
    /// <summary>Same value as the owning <see cref="GhostChatMessage.Id"/>.</summary>
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedImage { get; private set; } = null!;
    public string ImageInitializationVector { get; private set; } = null!;
    public DateTime CreatedAt { get; private set; }

    private GhostMessageImage() { }

    public static GhostMessageImage Create(
        Guid messageId,
        Guid ghostListId,
        string encryptedImage,
        string imageInitializationVector)
    {
        return new GhostMessageImage
        {
            Id = messageId,
            GhostListId = ghostListId,
            EncryptedImage = encryptedImage,
            ImageInitializationVector = imageInitializationVector,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
