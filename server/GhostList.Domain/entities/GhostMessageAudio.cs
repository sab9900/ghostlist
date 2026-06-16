using System;

namespace GhostList.Domain.Entities;

public class GhostMessageAudio
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedAudio { get; private set; } = null!;
    public string AudioInitializationVector { get; private set; } = null!;
    public DateTime CreatedAt { get; private set; }

    private GhostMessageAudio() { }

    public static GhostMessageAudio Create(
        Guid messageId,
        Guid ghostListId,
        string encryptedAudio,
        string audioInitializationVector)
    {
        return new GhostMessageAudio
        {
            Id = messageId,
            GhostListId = ghostListId,
            EncryptedAudio = encryptedAudio,
            AudioInitializationVector = audioInitializationVector,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
