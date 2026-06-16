using System;

namespace GhostList.Domain.Entities;

public class GhostMessageImage
{

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
