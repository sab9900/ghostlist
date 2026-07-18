using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Queries.GetEncryptedExpenses;

public record EncryptedExpenseDto(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    VerificationStatus Status,
    int SplitCount,
    bool IsArchived,
    DateTime CreatedAt,
    string? CreatedByDeviceId,
    string? CreatedByUserId,
    string? EncryptedReceiptKey,
    string? ReceiptBlobKey,
    IReadOnlyList<VerificationDto> Verifications);

public record VerificationDto(string VerifiedByUserId, DateTime VerifiedAt);

public record EncryptedSettlementDto(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    SettlementStatus Status,
    bool IsPaidByPayer,
    bool IsConfirmedByReceiver,
    DateTime? PaidAt,
    DateTime? ConfirmedAt,
    DateTime? ResolvedAt,
    string? PayerDeviceId,
    string? PayerUserId,
    string? ReceiverUserId,
    DateTime CreatedAt);

public record NemesisDataDto(
    IReadOnlyList<EncryptedExpenseDto> Expenses,
    IReadOnlyList<EncryptedSettlementDto> Settlements,
    int NemesisSettlementExpiryDays,
    int NemesisSettlementHideAfterDays);

public record GetEncryptedExpensesQuery(Guid GhostListId) : IRequest<NemesisDataDto>;

public class GetEncryptedExpensesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetEncryptedExpensesQuery, NemesisDataDto>
{
    public async Task<NemesisDataDto> Handle(GetEncryptedExpensesQuery request, CancellationToken cancellationToken)
    {
        var list = await context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.GhostListId, cancellationToken);

        if (list is null)
            return new NemesisDataDto([], [], 60, 30);

        var hideAfterDays = list.NemesisSettlementHideAfterDays;
        var cutoff = DateTime.UtcNow.AddDays(-hideAfterDays);

        var expenses = await context.NemesisExpenses
            .Include(e => e.Verifications)
            .Where(e => e.GhostListId == request.GhostListId &&
                        e.DeletedAt == null &&
                        (!e.IsArchived || e.Status == VerificationStatus.Verified))
            .OrderBy(e => e.CreatedAt)
            .ToListAsync(cancellationToken);

        var settlements = await context.NemesisSettlements
            .Where(s => s.GhostListId == request.GhostListId
                     && s.DeletedAt == null
                     && (s.Status == SettlementStatus.Pending
                         || s.Status == SettlementStatus.Confirmed
                         || (s.ResolvedAt != null && s.ResolvedAt >= cutoff)))
            .OrderBy(s => s.CreatedAt)
            .ToListAsync(cancellationToken);

        var expenseDtos = expenses.Select(e => new EncryptedExpenseDto(
            e.Id,
            e.GhostListId,
            e.EncryptedPayload,
            e.PayloadInitializationVector,
            e.Status,
            e.SplitCount,
            e.IsArchived,
            e.CreatedAt,
            e.CreatedByDeviceId,
            e.CreatedByUserId,
            e.EncryptedReceiptKey,
            e.ReceiptBlobKey,
            e.Verifications.Select(v => new VerificationDto(v.VerifiedByUserId, v.VerifiedAt)).ToList()
        )).ToList();

        var settlementDtos = settlements.Select(s => new EncryptedSettlementDto(
            s.Id,
            s.GhostListId,
            s.EncryptedPayload,
            s.PayloadInitializationVector,
            s.Status,
            s.IsPaidByPayer,
            s.IsConfirmedByReceiver,
            s.PaidAt,
            s.ConfirmedAt,
            s.ResolvedAt,
            s.PayerDeviceId,
            s.PayerUserId,
            s.ReceiverUserId,
            s.CreatedAt
        )).ToList();

        return new NemesisDataDto(expenseDtos, settlementDtos, list.NemesisSettlementExpiryDays, list.NemesisSettlementHideAfterDays);
    }
}
