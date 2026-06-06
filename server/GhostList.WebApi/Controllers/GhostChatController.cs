using GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;
using GhostList.Application.Features.GhostMessages.Commands.DeleteGhostChatMessage;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ChatController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<List<GhostChatMessageDto>>> GetByListId(Guid listId)
    {
        var messages = await mediator.Send(new GetGhostChatMessagesByListIdQuery(listId));
        return Ok(messages);
    }

    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateGhostMessageCommand command)
    {
        var token = Request.Headers["X-Device-Token"].FirstOrDefault();
        var messageId = await mediator.Send(command with { SenderDeviceToken = token });
        return Ok(messageId);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteMessage(Guid id)
    {
        await mediator.Send(new DeleteGhostChatMessageCommand(id));
        return NoContent();
    }
}
