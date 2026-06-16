using GhostList.Application.Features.InfoMessages;
using GhostList.Application.Features.InfoMessages.Queries;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/info")]
public class InfoController(IMediator mediator) : ControllerBase
{

    [HttpGet("latest")]
    public async Task<ActionResult<InfoMessageDto?>> GetLatest([FromQuery] DevicePlatform? platform)
    {
        var message = await mediator.Send(new GetLatestInfoMessageQuery(platform));
        return Ok(message);
    }
}
