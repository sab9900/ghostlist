using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SubscriptionsController(IApplicationDbContext context) : ControllerBase
{
    /// <summary>Register this device for push notifications on a list.</summary>
    [HttpPut("{listId:guid}")]
    public async Task<ActionResult> Subscribe(Guid listId, CancellationToken ct)
    {
        var deviceToken = Request.Headers["X-Device-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceToken))
            return BadRequest("X-Device-Token header is required.");

        var exists = await context.DeviceSubscriptions
            .AnyAsync(s => s.ListId == listId && s.DeviceToken == deviceToken, ct);

        if (!exists)
        {
            context.DeviceSubscriptions.Add(DeviceSubscription.Create(deviceToken, listId));
            await context.SaveChangesAsync(ct);
        }

        return NoContent();
    }

    /// <summary>Unregister this device from push notifications for a list.</summary>
    [HttpDelete("{listId:guid}")]
    public async Task<ActionResult> Unsubscribe(Guid listId, CancellationToken ct)
    {
        var deviceToken = Request.Headers["X-Device-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceToken))
            return BadRequest("X-Device-Token header is required.");

        var sub = await context.DeviceSubscriptions
            .FirstOrDefaultAsync(s => s.ListId == listId && s.DeviceToken == deviceToken, ct);

        if (sub is not null)
        {
            context.DeviceSubscriptions.Remove(sub);
            await context.SaveChangesAsync(ct);
        }

        return NoContent();
    }
}
