namespace GhostList.Application.Common.Interfaces;

public enum PushNotificationType
{

    Message,

    ItemsChanged,

    WhisperInvite,

    CharonDrop,

    ItemReminder,

    ListReminder,

    NemesisUpdate,

    NemesisSettlementUpdate,

    NemesisSettlementExpiring,

    NemesisSettlementExpired,

    NemesisSettlementForgiven,

    NemesisSettlementVoided,
}

public interface IPushNotificationService
{

    Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct, IReadOnlyCollection<string>? targetDeviceIds = null, IReadOnlyCollection<string>? targetUserIds = null);
}
