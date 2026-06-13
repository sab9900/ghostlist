using GhostList.Application.Features.InfoMessages;
using GhostList.Application.Features.InfoMessages.Commands.CreateInfoMessage;
using GhostList.Application.Features.InfoMessages.Commands.DeleteInfoMessage;
using GhostList.Application.Features.InfoMessages.Queries;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

/// <summary>
/// Manage broadcast info messages (release notes, maintenance windows, ...) shown to standard clients.
/// Protected by <see cref="GhostList.WebApi.Middleware.AdminAuthMiddleware"/>.
/// </summary>
[ApiController]
[Route("api/admin/info")]
public class AdminInfoController(IMediator mediator) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<InfoMessageDto>>> GetAll()
    {
        var messages = await mediator.Send(new GetInfoMessagesQuery());
        return Ok(messages);
    }

    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateInfoMessageCommand command)
    {
        var id = await mediator.Send(command);
        return Ok(id);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        await mediator.Send(new DeleteInfoMessageCommand(id));
        return NoContent();
    }
}
