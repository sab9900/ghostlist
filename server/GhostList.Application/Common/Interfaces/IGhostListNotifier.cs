using GhostList.Application.Common.Notifications;

namespace GhostList.Application.Common.Interfaces;

public interface IGhostListNotifier
{
    Task NotifyItemCreated(Guid listId, ItemCreatedNotification notification);
    Task NotifyItemToggled(Guid listId, ItemToggledNotification notification);
    Task NotifyItemDeleted(Guid listId, Guid itemId);
    Task NotifyMessageCreated(Guid listId, MessageCreatedNotification notification);
    Task NotifyMessageDeleted(Guid listId, Guid messageId);
    Task NotifyTtlUpdated(Guid listId, int newTtl);
    Task NotifyListDeleted(Guid listId);
    Task NotifyMemberKicked(Guid listId, string deviceId);

    /// <summary>
    /// Broadcasts that a new device/member has joined the list, so other
    /// connected clients can refresh their member list live (e.g. to reveal
    /// the Chat/Whisper/Charon tabs once a list stops being solo).
    /// </summary>
    Task NotifyMemberJoined(Guid listId, string deviceId);

    /// <summary>
    /// Relays an encrypted image to everyone else currently connected to the
    /// list. Not persisted anywhere — clients that aren't connected at this
    /// moment simply never receive it.
    /// </summary>
    Task NotifyImageShared(Guid listId, ImageRelayNotification notification);

    /// <summary>
    /// Broadcasts that a member's read receipt advanced, so other devices can
    /// update "read" checkmarks on their own messages without polling.
    /// </summary>
    Task NotifyReadReceiptUpdated(Guid listId, ReadReceiptUpdatedNotification notification);

    /// <summary>
    /// Broadcasts a newly created "burn after read" Charon drop to everyone
    /// in the list, so it appears as a sealed drop in their queue.
    /// </summary>
    Task NotifyCharonDropCreated(Guid listId, CharonDropCreatedNotification notification);

    /// <summary>
    /// Broadcasts that a Charon drop was removed (fully burned, recalled, or expired),
    /// so other devices remove it from their queue.
    /// </summary>
    Task NotifyCharonDropDeleted(Guid listId, Guid dropId);
}
