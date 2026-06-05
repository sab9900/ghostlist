using System;

namespace GhostList.Domain.Entities;

public class GhostChatMessage
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedMessage { get; private set; } = null!;
    public string InitializationVector { get; private set; } = null!;
    public string EncryptedSenderName { get; private set; } = null!;
    public string SenderNameInitializationVector { get; private set; } = null!;
    public DateTime CreatedAt { get; private set; }

    private GhostChatMessage() { }

    public static GhostChatMessage Create(
        Guid ghostListId,
        string encryptedMessage,
        string messageInitializationVector,
        string encryptedSenderName,
        string senderNameInitializationVector
        )
    {
        return new GhostChatMessage
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedMessage = encryptedMessage,
            InitializationVector = messageInitializationVector,
            EncryptedSenderName = encryptedSenderName,
            SenderNameInitializationVector = senderNameInitializationVector,
            CreatedAt = DateTime.UtcNow
        };
    }
}
