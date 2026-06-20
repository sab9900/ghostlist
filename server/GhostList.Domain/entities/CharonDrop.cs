using System;

namespace GhostList.Domain.Entities;

public class CharonDrop
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }

    public string EncryptedMetadata { get; private set; } = null!;
    public string MetadataInitializationVector { get; private set; } = null!;

    public DateTime CreatedAt { get; private set; }

    public string? SenderDeviceId { get; private set; }

    public string? SenderUserId { get; private set; }

    private CharonDrop() { }

    public static CharonDrop Create(
        Guid ghostListId,
        string encryptedMetadata,
        string metadataInitializationVector,
        string? senderDeviceId = null,
        string? senderUserId = null)
    {
        return new CharonDrop
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedMetadata = encryptedMetadata,
            MetadataInitializationVector = metadataInitializationVector,
            CreatedAt = DateTime.UtcNow,
            SenderDeviceId = senderDeviceId,
            SenderUserId = senderUserId,
        };
    }
}
