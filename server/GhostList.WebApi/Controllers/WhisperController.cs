using GhostList.Application.Features.Whisper.Commands.SendWhisperInvite;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace GhostList.WebApi.Controllers;

public record SendWhisperInviteRequest(List<string>? TargetDeviceIds);

[ApiController]
[Route("api/whisper")]
public class WhisperController(IMediator mediator, IMemoryCache cache) : ControllerBase
{
    private static readonly TimeSpan InviteCooldown = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Sends a "come watch now" push notification to other members of the list.
    /// Rate-limited to one invite per list per <see cref="InviteCooldown"/>,
    /// regardless of which device or recipients triggered it, to prevent spam
    /// from repeated button presses.
    /// </summary>
    [HttpPost("{listId:guid}/invite")]
    public async Task<IActionResult> Invite(Guid listId, [FromBody] SendWhisperInviteRequest? request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId)) return BadRequest();

        var cacheKey = $"whisper-invite-cooldown:{listId}";
        if (cache.TryGetValue(cacheKey, out _))
            return StatusCode(StatusCodes.Status429TooManyRequests);

        cache.Set(cacheKey, true, InviteCooldown);

        await mediator.Send(new SendWhisperInviteCommand(listId, deviceId, request?.TargetDeviceIds), ct);
        return NoContent();
    }
}
