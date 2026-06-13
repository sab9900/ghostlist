using GhostList.Application.Features.InfoMessages;
using GhostList.Application.Features.InfoMessages.Queries;
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
    [HttpGet("latest")]
    public async Task<ActionResult<InfoMessageDto?>> GetLatest()
    {
        var message = await mediator.Send(new GetLatestInfoMessageQuery());
        return Ok(message);
    }
}
