using GhostList.Application.Features.GhostListItems.Commands.CreateGhostListItem;
using GhostList.Application.Features.GhostListItems.Commands.DeleteGhostListItem;
using GhostList.Application.Features.GhostListItems.Commands.ToggleGhostListItem;
using GhostList.Application.Features.GhostListItems.Queries.GetGhostListItemsByListId;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GhostItemsController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<List<GhostListItemDto>>> GetByListId(Guid listId)
    {
        var items = await mediator.Send(new GetGhostListItemsByListIdQuery(listId));
        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateGhostListItemCommand command)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        var itemId = await mediator.Send(command with { SenderDeviceId = deviceId });
        return Ok(itemId);
    }

    [HttpPut("{id:guid}/toggle")]
    public async Task<ActionResult> Toggle(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        await mediator.Send(new ToggleGhostListItemCommand(id, deviceId));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteItem(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        await mediator.Send(new DeleteGhostListItemCommand(id, deviceId));
        return NoContent();
    }
}
