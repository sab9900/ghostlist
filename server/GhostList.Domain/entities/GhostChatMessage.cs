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

    /// <summary>
    /// Optional reference to the message this one replies to. Just a row id —
    /// carries no plaintext, so it doesn't compromise the zero-knowledge model.
    /// Not enforced as a foreign key so deleting the original message doesn't
    /// cascade or fail; clients treat a dangling reference as "unavailable".
    /// </summary>
    public Guid? ReplyToMessageId { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private GhostChatMessage() { }

    public static GhostChatMessage Create(
        Guid ghostListId,
        string encryptedMessage,
        string messageInitializationVector,
        string encryptedSenderName,
        string senderNameInitializationVector,
        Guid? replyToMessageId = null
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
            ReplyToMessageId = replyToMessageId,
            CreatedAt = DateTime.UtcNow
        };
    }
}
