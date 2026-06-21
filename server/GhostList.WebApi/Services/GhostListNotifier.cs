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

    public Task NotifyWhisperLifetimeUpdated(Guid listId, int newLifetimeSeconds) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("WhisperLifetimeUpdated", newLifetimeSeconds);

    public Task NotifyListDeleted(Guid listId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("ListDeleted", listId);

    public Task NotifyMemberKicked(Guid listId, string deviceId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("MemberKicked", listId, deviceId);

    public Task NotifyMemberJoined(Guid listId, string deviceId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("MemberJoined", listId, deviceId);

    public Task NotifyImageShared(Guid listId, ImageRelayNotification notification) =>
        hubContext.Clients.GroupExcept(listId.ToString(), notification.SenderConnectionId)
            .SendAsync("ImageShared", notification);

    public Task NotifyReadReceiptUpdated(Guid listId, ReadReceiptUpdatedNotification notification) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("ReadReceiptUpdated", notification);

    public Task NotifyCharonDropCreated(Guid listId, CharonDropCreatedNotification notification) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("CharonDropCreated", notification);

    public Task NotifyCharonDropDeleted(Guid listId, Guid dropId) =>
        hubContext.Clients.Group(listId.ToString()).SendAsync("CharonDropDeleted", dropId);

    public Task NotifyAudioShared(Guid listId, AudioRelayNotification notification) =>
        hubContext.Clients.GroupExcept(listId.ToString(), notification.SenderConnectionId)
            .SendAsync("AudioShared", notification);

    public Task NotifyVideoShared(Guid listId, VideoRelayNotification notification) =>
        hubContext.Clients.GroupExcept(listId.ToString(), notification.SenderConnectionId)
            .SendAsync("VideoShared", notification);

    public Task NotifyReminderFired(Guid listId, Guid itemId, Guid reminderId, string deviceId) =>
        hubContext.Clients.Group($"device-{deviceId}")
            .SendAsync("ReminderFired", new { listId, itemId, reminderId });

    public Task NotifyWhisperInviteReceived(Guid listId, string? senderDeviceId, IReadOnlyList<string>? targetDeviceIds) =>
        hubContext.Clients.Group(listId.ToString())
            .SendAsync("WhisperInviteReceived", new { listId, senderDeviceId, targetDeviceIds });

    public Task NotifyListReminderFired(Guid listId, Guid reminderId, DateTime remindAt, string deviceId) =>
        hubContext.Clients.Group($"device-{deviceId}")
            .SendAsync("ListReminderFired", new { listId, reminderId, remindAt });
}
