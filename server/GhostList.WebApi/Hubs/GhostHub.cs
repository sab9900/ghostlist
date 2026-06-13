using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralImage;
using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace GhostList.WebApi.Hubs;

public class GhostListHub(IMediator mediator, IPresenceTracker presence, ILogger<GhostListHub> logger) : Hub
{
    public async Task JoinListRoom(string listId, string deviceId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, listId);
        presence.JoinList(Context.ConnectionId, listId, deviceId);
    }

    public async Task LeaveListRoom(string listId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, listId);
        presence.LeaveList(Context.ConnectionId, listId);
    }

    /// <summary>
    /// Reports whether the app is currently in the foreground on this device,
    /// regardless of which (if any) list room is open. Used to suppress push
    /// notifications while the user has the app open at all.
    /// </summary>
    public Task SetAppState(string deviceId, bool isForeground)
    {
        presence.SetForeground(Context.ConnectionId, deviceId, isForeground);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Live, non-persisted relay of an encrypted image to everyone else
    /// currently in the list's room. Called directly by clients (not via the
    /// REST API) — the image never touches the database.
    /// </summary>
    public async Task RelayImage(string listId, string messageId, string encryptedImage, string imageInitializationVector)
    {
        if (!Guid.TryParse(listId, out var listGuid) || !Guid.TryParse(messageId, out var messageGuid))
            return;

        try
        {
            await mediator.Send(new RelayEphemeralImageCommand(
                listGuid,
                messageGuid,
                encryptedImage,
                imageInitializationVector,
                Context.ConnectionId));
        }
        catch (ValidationException ex)
        {
            logger.LogWarning(ex, "Rejected image relay for list {ListId}", listGuid);
        }
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        presence.RemoveConnection(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}
