namespace GhostList.Application.Common.Notifications;

public record ItemCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string InitializationVector,
    bool IsChecked,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId);

public record ItemToggledNotification(
    Guid ItemId,
    bool IsChecked,
    DateTime? CheckedAt,
    string? CheckedByDeviceId,
    string? CheckedByUserId);

public record MessageCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedMessage,
    string InitializationVector,
    string EncryptedSenderName,
    string SenderNameInitializationVector,
    Guid? ReplyToMessageId,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId);

public record ImageRelayNotification(
    Guid MessageId,
    Guid GhostListId,
    string EncryptedImage,
    string ImageInitializationVector,
    string SenderConnectionId);

public record ReadReceiptUpdatedNotification(
    Guid GhostListId,
    string DeviceId,
    DateTimeOffset? LastReadMessageAt);

public record CharonDropCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedContent,
    string ContentInitializationVector,
    string EncryptedMetadata,
    string MetadataInitializationVector,
    DateTime CreatedAt,
    string? SenderDeviceId,
    string? SenderUserId);

public record CharonDropDeletedNotification(Guid Id, Guid GhostListId);

public record AudioRelayNotification(
    Guid MessageId,
    Guid GhostListId,
    string EncryptedAudio,
    string AudioInitializationVector,
    string SenderConnectionId);

public record VideoRelayNotification(
    Guid MessageId,
    Guid GhostListId,
    string EncryptedVideo,
    string VideoInitializationVector,
    string SenderConnectionId);
