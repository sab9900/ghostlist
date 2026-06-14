using GhostList.Application.Features.Charon.Commands.CreateCharonDrop;
using GhostList.Application.Features.Charon.Commands.DeleteCharonDrop;
using GhostList.Application.Features.Charon.Commands.MarkCharonDropViewed;
using GhostList.Application.Features.Charon.Queries.GetCharonDropsByListId;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CharonController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<List<CharonDropDto>>> GetByListId(Guid listId)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var drops = await mediator.Send(new GetCharonDropsByListIdQuery(listId, deviceId));
        return Ok(drops);
    }

    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateCharonDropCommand command)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();
        var dropId = await mediator.Send(command with { SenderDeviceId = deviceId, SenderUserId = userId });
        return Ok(dropId);
    }

    [HttpPost("{id:guid}/view")]
    public async Task<ActionResult> MarkViewed(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        await mediator.Send(new MarkCharonDropViewedCommand(id, deviceId));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteCharonDropCommand(id));
        return NoContent();
    }
}
