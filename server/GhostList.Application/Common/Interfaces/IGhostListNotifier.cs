using GhostList.Application.Common.Notifications;

namespace GhostList.Application.Common.Interfaces;

public interface IGhostListNotifier
{
    Task NotifyItemCreated(Guid listId, ItemCreatedNotification notification);
    Task NotifyItemToggled(Guid listId, ItemToggledNotification notification);
    Task NotifyItemDeleted(Guid listId, Guid itemId);
    Task NotifyItemPriorityChanged(Guid listId, ItemPriorityChangedNotification notification);
    Task NotifyMessageCreated(Guid listId, MessageCreatedNotification notification);
    Task NotifyMessageDeleted(Guid listId, Guid messageId);
    Task NotifyTtlUpdated(Guid listId, int newTtl);
    Task NotifyWhisperLifetimeUpdated(Guid listId, int newLifetimeSeconds);
    Task NotifyListDeleted(Guid listId);
    Task NotifyMemberKicked(Guid listId, string deviceId);

    Task NotifyMemberJoined(Guid listId, string deviceId);

    Task NotifyImageShared(Guid listId, ImageRelayNotification notification);

    Task NotifyReadReceiptUpdated(Guid listId, ReadReceiptUpdatedNotification notification);

    Task NotifyCharonDropCreated(Guid listId, CharonDropCreatedNotification notification);

    Task NotifyCharonDropDeleted(Guid listId, Guid dropId);

    Task NotifyCharonDropViewed(Guid listId, Guid dropId, string viewerIdentity);

    Task NotifyAudioShared(Guid listId, AudioRelayNotification notification);

    Task NotifyVideoShared(Guid listId, VideoRelayNotification notification);

    /// <summary>Sent only to the device that owns the reminder (via device-group).</summary>
    Task NotifyReminderFired(Guid listId, Guid itemId, Guid reminderId, string deviceId);

    Task NotifyWhisperInviteReceived(Guid listId, string? senderDeviceId, IReadOnlyList<string>? targetDeviceIds);

    Task NotifyListReminderFired(Guid listId, Guid reminderId, DateTime remindAt, string deviceId);

    Task NotifyNemesisExpenseCreated(Guid listId, NemesisExpenseCreatedNotification notification);
    Task NotifyNemesisExpenseVerified(Guid listId, NemesisExpenseVerifiedNotification notification);
    Task NotifyNemesisSettlementCreated(Guid listId, NemesisSettlementCreatedNotification notification);
    Task NotifyNemesisSettlementConfirmed(Guid listId, NemesisSettlementConfirmedNotification notification);
    Task NotifyNemesisSettlementDeclined(Guid listId, NemesisSettlementDeclinedNotification notification);
    Task NotifyNemesisExpenseArchived(Guid listId, NemesisExpenseArchivedNotification notification);

    Task NotifyNemesisSettlementVoided(Guid listId, NemesisSettlementVoidedNotification notification);
    Task NotifyNemesisSettlementExpired(Guid listId, NemesisSettlementExpiredNotification notification);
    Task NotifyNemesisSettlementForgiven(Guid listId, NemesisSettlementForgivenNotification notification);
    Task NotifyNemesisSettlementExpiring(Guid listId, NemesisSettlementExpiringNotification notification);

    Task NotifyReactionChanged(Guid listId, ReactionChangedNotification notification);
}
