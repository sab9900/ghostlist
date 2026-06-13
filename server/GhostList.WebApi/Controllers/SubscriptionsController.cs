using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GhostList.WebApi.Controllers;

public record SubscribeRequest(
    string DeviceToken,
    DevicePlatform Platform,
    bool NotifyOnMessage = true,
    bool NotifyOnItemsChanged = true);

[ApiController]
[Route("api/[controller]")]
public class SubscriptionsController(IApplicationDbContext context) : ControllerBase
{
    /// <summary>
    /// Register (or update) this device's push subscription for a list —
    /// including its push token, platform, and per-list notification
    /// preferences. Called whenever the token changes or the user updates
    /// their notification settings.
    /// </summary>
    [HttpPut("{listId:guid}")]
    public async Task<ActionResult> Subscribe(Guid listId, [FromBody] SubscribeRequest request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        if (string.IsNullOrWhiteSpace(request.DeviceToken))
            return BadRequest("DeviceToken is required.");

        var sub = await context.DeviceSubscriptions
            .FirstOrDefaultAsync(s => s.ListId == listId && s.DeviceId == deviceId, ct);

        if (sub is null)
        {
            context.DeviceSubscriptions.Add(DeviceSubscription.Create(
                deviceId,
                listId,
                request.DeviceToken,
                request.Platform,
                request.NotifyOnMessage,
                request.NotifyOnItemsChanged));
        }
        else
        {
            sub.UpdateToken(request.DeviceToken, request.Platform);
            sub.UpdatePreferences(request.NotifyOnMessage, request.NotifyOnItemsChanged);
        }

        await context.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Unregister this device from push notifications for a list.</summary>
    [HttpDelete("{listId:guid}")]
    public async Task<ActionResult> Unsubscribe(Guid listId, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var sub = await context.DeviceSubscriptions
            .FirstOrDefaultAsync(s => s.ListId == listId && s.DeviceId == deviceId, ct);

        if (sub is not null)
        {
            context.DeviceSubscriptions.Remove(sub);
            await context.SaveChangesAsync(ct);
        }

        return NoContent();
    }
}
