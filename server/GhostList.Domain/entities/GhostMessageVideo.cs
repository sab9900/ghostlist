using System;

namespace GhostList.Domain.Entities;

public class GhostMessageVideo
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedVideo { get; private set; } = null!;
    public string VideoInitializationVector { get; private set; } = null!;
    public DateTime CreatedAt { get; private set; }

    private GhostMessageVideo() { }

    public static GhostMessageVideo Create(
        Guid messageId,
        Guid ghostListId,
        string encryptedVideo,
        string videoInitializationVector)
    {
        return new GhostMessageVideo
        {
            Id = messageId,
            GhostListId = ghostListId,
            EncryptedVideo = encryptedVideo,
            VideoInitializationVector = videoInitializationVector,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
