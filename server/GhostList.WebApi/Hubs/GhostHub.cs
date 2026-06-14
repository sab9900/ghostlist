using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralImage;
using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace GhostList.WebApi.Hubs;

public class GhostListHub(IMediator mediator, IPresenceTracker presence, IWhisperPresenceTracker whisperPresence, ILogger<GhostListHub> logger) : Hub
{
    private const string WhisperGroupPrefix = "whisper-";

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
    /// Joins the ephemeral "Whisper" room for a list. Reports a plaintext
    /// display name purely for the live presence roster — the server never
    /// persists it and cannot decrypt anything else about the user.
    /// </summary>
    public async Task JoinWhisperRoom(string listId, string deviceId, string displayName)
    {
        var group = WhisperGroupPrefix + listId;
        await Groups.AddToGroupAsync(Context.ConnectionId, group);
        var roster = whisperPresence.Join(listId, Context.ConnectionId, deviceId, displayName);
        await Clients.Group(group).SendAsync("WhisperPresenceChanged", listId, roster);
    }

    public async Task LeaveWhisperRoom(string listId)
    {
        var group = WhisperGroupPrefix + listId;
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, group);
        var roster = whisperPresence.Leave(listId, Context.ConnectionId);
        await Clients.Group(group).SendAsync("WhisperPresenceChanged", listId, roster);
    }

    /// <summary>
    /// Live, non-persisted relay of an encrypted "whisper" message to everyone
    /// else currently in the list's whisper room. Nothing is ever written to
    /// the database — connections that aren't currently in the room never see it.
    /// </summary>
    public async Task SendWhisper(string listId, string ciphertext, string iv, string senderCiphertext, string senderIv)
    {
        var group = WhisperGroupPrefix + listId;
        await Clients.GroupExcept(group, Context.ConnectionId).SendAsync("WhisperReceived", new
        {
            listId,
            ciphertext,
            iv,
            senderCiphertext,
            senderIv,
        });
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

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        presence.RemoveConnection(Context.ConnectionId);

        var whisperResult = whisperPresence.RemoveConnection(Context.ConnectionId);
        if (whisperResult is { } result)
        {
            var group = WhisperGroupPrefix + result.ListId;
            await Clients.Group(group).SendAsync("WhisperPresenceChanged", result.ListId, result.Roster);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
