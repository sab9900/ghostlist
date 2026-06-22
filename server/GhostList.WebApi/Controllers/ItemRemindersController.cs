using GhostList.Application.Features.ItemReminders.Commands.AcknowledgeItemReminder;
using GhostList.Application.Features.ItemReminders.Commands.CreateItemReminder;
using GhostList.Application.Features.ItemReminders.Commands.DeleteItemReminder;
using GhostList.Application.Features.ItemReminders.Queries.GetItemReminders;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ItemRemindersController(IMediator mediator) : ControllerBase
{
    public record CreateItemReminderRequest(
        Guid GhostListId,
        Guid ItemId,
        DateTime RemindAt);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ItemReminderDto>>> GetForList(
        [FromQuery] Guid ghostListId,
        CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var result = await mediator.Send(new GetItemRemindersQuery(ghostListId, deviceId), ct);
        return Ok(result);
    }

    [HttpPost]
    [EnableRateLimiting("write-content")]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateItemReminderRequest request)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var id = await mediator.Send(new CreateItemReminderCommand(
            request.GhostListId,
            request.ItemId,
            deviceId,
            request.RemindAt));

        return Ok(id);
    }

    [HttpDelete("{id:guid}")]
    [EnableRateLimiting("write-content")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        await mediator.Send(new DeleteItemReminderCommand(id, deviceId));
        return NoContent();
    }

    [HttpPut("{id:guid}/acknowledge")]
    [EnableRateLimiting("write-content")]
    public async Task<ActionResult> Acknowledge(Guid id)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrEmpty(deviceId))
            return BadRequest("X-Device-Id header is required.");

        await mediator.Send(new AcknowledgeItemReminderCommand(id, deviceId));
        return NoContent();
    }
}
