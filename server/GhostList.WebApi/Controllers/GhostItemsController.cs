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
        var token = Request.Headers["X-Device-Token"].FirstOrDefault();
        var itemId = await mediator.Send(command with { SenderDeviceToken = token });
        return Ok(itemId);
    }

    [HttpPut("{id:guid}/toggle")]
    public async Task<ActionResult> Toggle(Guid id)
    {
        await mediator.Send(new ToggleGhostListItemCommand(id));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteItem(Guid id)
    {
        await mediator.Send(new DeleteGhostListItemCommand(id));
        return NoContent();
    }
}
