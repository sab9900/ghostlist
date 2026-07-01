using GhostList.Application.Features.Nemesis.Commands.ArchiveExpense;
using GhostList.Application.Features.Nemesis.Commands.ConfirmSettlement;
using GhostList.Application.Features.Nemesis.Commands.DeclineSettlement;
using GhostList.Application.Features.Nemesis.Commands.CreateExpense;
using GhostList.Application.Features.Nemesis.Commands.ForgiveSettlement;
using GhostList.Application.Features.Nemesis.Commands.RejectExpense;
using GhostList.Application.Features.Nemesis.Commands.SaveNemesisReceipt;
using GhostList.Application.Features.Nemesis.Commands.SubmitSettlement;
using GhostList.Application.Features.Nemesis.Commands.UpdateNemesisSettings;
using GhostList.Application.Features.Nemesis.Commands.VerifyExpense;
using GhostList.Application.Features.Nemesis.Queries.GetArchivedExpenses;
using GhostList.Application.Features.Nemesis.Queries.GetEncryptedExpenses;
using GhostList.Application.Features.Nemesis.Queries.GetNemesisReceipt;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/nemesis")]
public class NemesisController(IMediator mediator) : ControllerBase
{
    [HttpGet("{listId:guid}")]
    public async Task<ActionResult<NemesisDataDto>> GetExpenses(Guid listId, CancellationToken ct)
    {
        var result = await mediator.Send(new GetEncryptedExpensesQuery(listId), ct);
        return Ok(result);
    }

    [HttpPost("expenses")]
    public async Task<ActionResult<Guid>> CreateExpense([FromBody] CreateExpenseRequest request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();

        var id = await mediator.Send(new CreateExpenseCommand(
            request.GhostListId,
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            request.SplitCount,
            deviceId,
            userId,
            request.SplitBetweenUserIds), ct);

        return CreatedAtAction(nameof(GetExpenses), new { listId = request.GhostListId }, id);
    }

    [HttpPost("expenses/{expenseId:guid}/receipt")]
    public async Task<IActionResult> SaveReceipt(Guid expenseId, [FromBody] SaveReceiptRequest request, CancellationToken ct)
    {
        await mediator.Send(new SaveNemesisReceiptCommand(expenseId, request.EncryptedReceipt, request.ReceiptIv), ct);
        return NoContent();
    }

    [HttpGet("expenses/{expenseId:guid}/receipt")]
    public async Task<ActionResult<NemesisReceiptDto>> GetReceipt(Guid expenseId, CancellationToken ct)
    {
        var result = await mediator.Send(new GetNemesisReceiptQuery(expenseId), ct);
        return Ok(result);
    }

    [HttpPost("expenses/{expenseId:guid}/verify")]
    public async Task<IActionResult> VerifyExpense(Guid expenseId, [FromBody] VerifyExpenseRequest request, CancellationToken ct)
    {
        await mediator.Send(new VerifyExpenseCommand(expenseId, request.UserId), ct);
        return NoContent();
    }

    [HttpPost("expenses/{expenseId:guid}/reject")]
    public async Task<IActionResult> RejectExpense(Guid expenseId, CancellationToken ct)
    {
        await mediator.Send(new RejectExpenseCommand(expenseId), ct);
        return NoContent();
    }

    [HttpPost("expenses/{expenseId:guid}/archive")]
    public async Task<IActionResult> ArchiveExpense(Guid expenseId, CancellationToken ct)
    {
        await mediator.Send(new ArchiveExpenseCommand(expenseId), ct);
        return NoContent();
    }

    [HttpGet("{listId:guid}/archived-expenses")]
    public async Task<ActionResult<ArchivedExpensesDto>> GetArchivedExpenses(
        Guid listId,
        [FromQuery] DateTime? cursor,
        CancellationToken ct)
    {
        var result = await mediator.Send(new GetArchivedExpensesQuery(listId, cursor), ct);
        return Ok(result);
    }

    [HttpPost("settlements")]
    public async Task<ActionResult<Guid>> SubmitSettlement([FromBody] SubmitSettlementRequest request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        var userId = Request.Headers["X-User-Id"].FirstOrDefault();

        var id = await mediator.Send(new SubmitSettlementCommand(
            request.GhostListId,
            request.EncryptedPayload,
            request.PayloadInitializationVector,
            deviceId,
            userId,
            request.ReceiverUserId), ct);

        return CreatedAtAction(nameof(GetExpenses), new { listId = request.GhostListId }, id);
    }

    [HttpPost("settlements/{settlementId:guid}/confirm")]
    public async Task<IActionResult> ConfirmSettlement(Guid settlementId, CancellationToken ct)
    {
        await mediator.Send(new ConfirmSettlementCommand(settlementId), ct);
        return NoContent();
    }

    [HttpDelete("settlements/{settlementId:guid}")]
    public async Task<IActionResult> DeclineSettlement(Guid settlementId, CancellationToken ct)
    {
        await mediator.Send(new DeclineSettlementCommand(settlementId), ct);
        return NoContent();
    }

    [HttpPost("settlements/{settlementId:guid}/forgive")]
    public async Task<IActionResult> ForgiveSettlement(Guid settlementId, CancellationToken ct)
    {
        await mediator.Send(new ForgiveSettlementCommand(settlementId), ct);
        return NoContent();
    }

    [HttpPut("{listId:guid}/settings")]
    public async Task<IActionResult> UpdateNemesisSettings(Guid listId, [FromBody] UpdateNemesisSettingsRequest request, CancellationToken ct)
    {
        await mediator.Send(new UpdateNemesisSettingsCommand(listId, request.ExpiryDays, request.HideAfterDays), ct);
        return NoContent();
    }
}

public record CreateExpenseRequest(
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    int SplitCount,
    IReadOnlyList<string>? SplitBetweenUserIds = null);

public record SaveReceiptRequest(string EncryptedReceipt, string ReceiptIv);

public record VerifyExpenseRequest(string UserId);

public record SubmitSettlementRequest(
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    string? ReceiverUserId = null);

public record UpdateNemesisSettingsRequest(int ExpiryDays, int HideAfterDays);
