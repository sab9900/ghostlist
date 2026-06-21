using GhostList.Application.Features.ListReminders.Commands.AcknowledgeListReminder;
using GhostList.Application.Features.ListReminders.Commands.CreateListReminder;
using GhostList.Application.Features.ListReminders.Commands.DeleteListReminder;
using GhostList.Application.Features.ListReminders.Queries.GetListReminders;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ListRemindersController(IMediator mediator) : ControllerBase
{
    public record CreateListReminderRequest(
        Guid GhostListId,
        DateTime RemindAt);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ListReminderDto>>> GetForList(
        [FromQuery] Guid ghostListId,
        CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var result = await mediator.Send(new GetListRemindersQuery(ghostListId, deviceId), ct);
        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateListReminderRequest request)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var id = await mediator.Send(new CreateListReminderCommand(
            request.GhostListId,
            deviceId,
            request.RemindAt));

        return Ok(id);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        await mediator.Send(new DeleteListReminderCommand(id, deviceId));
        return NoContent();
    }

    [HttpPut("{id:guid}/acknowledge")]
    public async Task<ActionResult> Acknowledge(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        await mediator.Send(new AcknowledgeListReminderCommand(id, deviceId));
        return NoContent();
    }
}
