using Microsoft.AspNetCore.SignalR;

namespace GhostList.WebApi.Hubs;

public class GhostListHub : Hub
{
    public async Task JoinListRoom(string listId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, listId);
    }

    public async Task LeaveListRoom(string listId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, listId);
    }
}