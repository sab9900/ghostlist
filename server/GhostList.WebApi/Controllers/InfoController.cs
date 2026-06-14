using GhostList.Application.Features.InfoMessages;
using GhostList.Application.Features.InfoMessages.Queries;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

/// <summary>
/// Public read access to admin-authored info messages (release notes, maintenance windows, ...).
/// Standard clients poll <c>latest</c> on startup to show an "unread" overlay.
/// </summary>
[ApiController]
[Route("api/info")]
public class InfoController(IMediator mediator) : ControllerBase
{
    /// <param name="platform">
    /// The requesting client's platform (e.g. <c>android</c>, <c>ios</c>, <c>web</c>), so
    /// platform-specific messages (like an Android release announcement) are only returned
    /// to matching clients. Omit for "all platforms" messages only.
    /// </param>
    [HttpGet("latest")]
    public async Task<ActionResult<InfoMessageDto?>> GetLatest([FromQuery] DevicePlatform? platform)
    {
        var message = await mediator.Send(new GetLatestInfoMessageQuery(platform));
        return Ok(message);
    }
}
