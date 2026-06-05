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
}
