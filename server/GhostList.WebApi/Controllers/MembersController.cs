using GhostList.Application.Features.ListMembers.Commands.DeleteListMember;
using GhostList.Application.Features.ListMembers.Commands.KickListMember;
using GhostList.Application.Features.ListMembers.Commands.MarkItemsRead;
using GhostList.Application.Features.ListMembers.Commands.MarkMessagesRead;
using GhostList.Application.Features.ListMembers.Commands.UpdateReadReceipt;
using GhostList.Application.Features.ListMembers.Commands.UpsertListMember;
using GhostList.Application.Features.ListMembers.Queries;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

public record UpsertMemberRequest(string EncryptedPayload, string InitializationVector);

public record ReadReceiptRequest(DateTimeOffset? LastReadMessageAt, DateTimeOffset? LastReadItemAt);

public record MarkReadRequest(List<Guid> Ids);

[ApiController]
[Route("api/members")]
public class MembersController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<IEnumerable<ListMemberDto>>> GetMembers(Guid listId, CancellationToken ct)
    {
        var members = await mediator.Send(new GetListMembersQuery(listId), ct);
        return Ok(members);
    }

    [HttpPut("{listId:guid}/{deviceId}")]
    public async Task<IActionResult> UpsertMember(Guid listId, string deviceId, [FromBody] UpsertMemberRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || deviceId.Length > 64) return BadRequest();
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();
        await mediator.Send(new UpsertListMemberCommand(listId, deviceId, request.EncryptedPayload, request.InitializationVector, userId), ct);
        return NoContent();
    }

    [HttpDelete("{listId:guid}/{deviceId}")]
    public async Task<IActionResult> DeleteMember(Guid listId, string deviceId, CancellationToken ct)
    {
        await mediator.Send(new DeleteListMemberCommand(listId, deviceId), ct);
        return NoContent();
    }

    [HttpDelete("{listId:guid}/{deviceId}/kick")]
    public async Task<IActionResult> KickMember(Guid listId, string deviceId, [FromQuery] string? ownerToken, CancellationToken ct)
    {
        await mediator.Send(new KickListMemberCommand(listId, deviceId, ownerToken), ct);
        return NoContent();
    }

    [HttpPut("{listId:guid}/{deviceId}/read-receipt")]
    public async Task<IActionResult> UpdateReadReceipt(Guid listId, string deviceId, [FromBody] ReadReceiptRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || deviceId.Length > 64) return BadRequest();
        await mediator.Send(new UpdateReadReceiptCommand(listId, deviceId, request.LastReadMessageAt, request.LastReadItemAt), ct);
        return NoContent();
    }

    [HttpGet("{listId:guid}/{deviceId}/unread")]
    public async Task<ActionResult<UnreadSummaryDto>> GetUnreadSummary(Guid listId, string deviceId, CancellationToken ct)
    {
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();
        var summary = await mediator.Send(new GetGhostListUnreadSummaryQuery(listId, deviceId, userId), ct);
        return Ok(summary);
    }

    /// <summary>Marks the given chat messages as read by this device (granular per-message read receipts).</summary>
    [HttpPost("{listId:guid}/{deviceId}/read-receipts/messages")]
    public async Task<IActionResult> MarkMessagesRead(Guid listId, string deviceId, [FromBody] MarkReadRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || deviceId.Length > 64) return BadRequest();
        await mediator.Send(new MarkMessagesReadCommand(listId, deviceId, request.Ids), ct);
        return NoContent();
    }

    /// <summary>Marks the given list items as read (seen) by this device (granular per-item read receipts).</summary>
    [HttpPost("{listId:guid}/{deviceId}/read-receipts/items")]
    public async Task<IActionResult> MarkItemsRead(Guid listId, string deviceId, [FromBody] MarkReadRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || deviceId.Length > 64) return BadRequest();
        await mediator.Send(new MarkItemsReadCommand(listId, deviceId, request.Ids), ct);
        return NoContent();
    }
}
