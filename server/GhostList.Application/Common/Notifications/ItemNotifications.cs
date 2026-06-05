namespace GhostList.Application.Common.Notifications;

public record ItemCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string InitializationVector,
    bool IsChecked,
    DateTime CreatedAt);

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
    DateTime CreatedAt);
