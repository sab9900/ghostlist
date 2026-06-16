using FluentValidation;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Commands.RelayEphemeralAudio;
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
        await Groups.AddToGroupAsync(Context.ConnectionId, $"device-{deviceId}");
        presence.JoinList(Context.ConnectionId, listId, deviceId);
    }

    public async Task LeaveListRoom(string listId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, listId);
        presence.LeaveList(Context.ConnectionId, listId);
    }

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

    public Task SetAppState(string deviceId, bool isForeground)
    {
        presence.SetForeground(Context.ConnectionId, deviceId, isForeground);
        return Task.CompletedTask;
    }

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

    public async Task RelayAudio(string listId, string messageId, string encryptedAudio, string audioInitializationVector)
    {
        if (!Guid.TryParse(listId, out var listGuid) || !Guid.TryParse(messageId, out var messageGuid))
            return;

        try
        {
            await mediator.Send(new RelayEphemeralAudioCommand(
                listGuid,
                messageGuid,
                encryptedAudio,
                audioInitializationVector,
                Context.ConnectionId));
        }
        catch (ValidationException ex)
        {
            logger.LogWarning(ex, "Rejected audio relay for list {ListId}", listGuid);
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
