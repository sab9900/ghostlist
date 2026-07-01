namespace GhostList.Domain.Entities;

public class GhostMessageReaction
{
    public Guid Id { get; private set; }
    public Guid MessageId { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedEmoji { get; private set; } = null!;
    public string EmojiInitializationVector { get; private set; } = null!;
    public string EncryptedSenderName { get; private set; } = null!;
    public string SenderNameInitializationVector { get; private set; } = null!;
    public string? SenderDeviceId { get; private set; }
    public string? SenderUserId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private GhostMessageReaction() { }

    public static GhostMessageReaction Create(
        Guid messageId,
        Guid ghostListId,
        string encryptedEmoji,
        string emojiInitializationVector,
        string encryptedSenderName,
        string senderNameInitializationVector,
        string? senderDeviceId = null,
        string? senderUserId = null)
    {
        return new GhostMessageReaction
        {
            Id = Guid.NewGuid(),
            MessageId = messageId,
            GhostListId = ghostListId,
            EncryptedEmoji = encryptedEmoji,
            EmojiInitializationVector = emojiInitializationVector,
            EncryptedSenderName = encryptedSenderName,
            SenderNameInitializationVector = senderNameInitializationVector,
            SenderDeviceId = senderDeviceId,
            SenderUserId = senderUserId,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
