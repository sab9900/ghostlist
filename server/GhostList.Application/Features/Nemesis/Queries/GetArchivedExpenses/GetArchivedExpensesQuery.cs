using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.Nemesis.Queries.GetEncryptedExpenses;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Queries.GetArchivedExpenses;

public record ArchivedExpensesDto(
    IReadOnlyList<EncryptedExpenseDto> Expenses,
    DateTime? NextCursor);

public record GetArchivedExpensesQuery(Guid GhostListId, DateTime? Cursor) : IRequest<ArchivedExpensesDto>;

public class GetArchivedExpensesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetArchivedExpensesQuery, ArchivedExpensesDto>
{
    private const int PageSize = 30;

    public async Task<ArchivedExpensesDto> Handle(GetArchivedExpensesQuery request, CancellationToken cancellationToken)
    {
        var query = context.NemesisExpenses
            .Include(e => e.Verifications)
            .Where(e => e.GhostListId == request.GhostListId && e.IsArchived && e.DeletedAt == null);

        if (request.Cursor.HasValue)
            query = query.Where(e => e.CreatedAt < request.Cursor.Value);

        var expenses = await query
            .OrderByDescending(e => e.CreatedAt)
            .Take(PageSize + 1)
            .ToListAsync(cancellationToken);

        DateTime? nextCursor = null;
        if (expenses.Count > PageSize)
        {
            expenses = expenses.Take(PageSize).ToList();
            nextCursor = expenses.Last().CreatedAt;
        }

        var dtos = expenses.Select(e => new EncryptedExpenseDto(
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

        return new ArchivedExpensesDto(dtos, nextCursor);
    }
}
