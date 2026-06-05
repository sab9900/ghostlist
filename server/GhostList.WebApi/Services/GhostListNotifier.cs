using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.WebApi.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace GhostList.WebApi.Services;

public class GhostListNotifier(IHubContext<GhostListHub> hubContext) : IGhostListNotifier
{
    public Task NotifyItemCreated(Guid listId, ItemCreatedNotification notification) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("ItemCreated", notification);

    public Task NotifyItemToggled(Guid listId, ItemToggledNotification notification) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("ItemToggled", notification);

    public Task NotifyItemDeleted(Guid listId, Guid itemId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("ItemDeleted", itemId);

    public Task NotifyMessageCreated(Guid listId, MessageCreatedNotification notification) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("MessageReceived", notification);

    public Task NotifyMessageDeleted(Guid listId, Guid messageId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("MessageDeleted", messageId);

    public Task NotifyTtlUpdated(Guid listId, int newTtl) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("TtlUpdated", newTtl);
}
