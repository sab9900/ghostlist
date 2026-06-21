using GhostList.Application.Features.GhostLists.Commands.CreateGhostList;
using GhostList.Application.Features.GhostLists.Commands.DeleteGhostList;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListTtl;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListWhisperLifetime;
using GhostList.Application.Features.GhostLists.Queries.GetGhostListById;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

public record CreateGhostListRequest(string? OwnerTokenHash = null);

[ApiController]
[Route("api/[controller]")]
public class GhostListController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateGhostListRequest? request = null)
    {
        var listId = await mediator.Send(new CreateGhostListCommand(request?.OwnerTokenHash));
        return Ok(listId);
    }

    [HttpHead("{id:guid}")]
    public async Task<ActionResult> Exists(Guid id)
    {
        var result = await mediator.Send(new GetGhostListByIdQuery(id));
        return result == null ? NotFound() : Ok();
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GhostListDto>> GetById(Guid id)
    {
        var result = await mediator.Send(new GetGhostListByIdQuery(id));
        if (result == null) return NotFound("Ghost list expired or never existed.");
        return Ok(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, [FromQuery] string? ownerToken = null)
    {
        await mediator.Send(new DeleteGhostListCommand(id, ownerToken));
        return NoContent();
    }

    [HttpPatch("{id:guid}/ttl")]
    public async Task<ActionResult> UpdateTtl(Guid id, [FromBody] DeleteAfterDuration ttl)
    {
        await mediator.Send(new UpdateGhostListTtlCommand(id, ttl));
        return NoContent();
    }

    [HttpPatch("{id:guid}/whisper-lifetime")]
    public async Task<ActionResult> UpdateWhisperLifetime(Guid id, [FromBody] WhisperLifetime lifetime)
    {
        await mediator.Send(new UpdateGhostListWhisperLifetimeCommand(id, lifetime));
        return NoContent();
    }
}
