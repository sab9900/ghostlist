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
    DateTime? CheckedAt);

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

/// <summary>
/// Live, non-persisted relay of an encrypted image blob to currently-connected
/// list members. Never written to the database — purely a SignalR pass-through
/// so images never live on the server.
/// </summary>
public record ImageRelayNotification(
    Guid MessageId,
    Guid GhostListId,
    string EncryptedImage,
    string ImageInitializationVector,
    string SenderConnectionId);

/// <summary>
/// A member's read-receipt advanced. Plain timestamp + deviceId only — no
/// message ids/content — so this stays zero-knowledge compatible.
/// </summary>
public record ReadReceiptUpdatedNotification(
    Guid GhostListId,
    string DeviceId,
    DateTimeOffset? LastReadMessageAt);
