using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Queries.GetNemesisReceipt;

public record GetNemesisReceiptQuery(Guid ExpenseId) : IRequest<NemesisReceiptDto>;

public record NemesisReceiptDto(string EncryptedReceipt, string ReceiptIv);

public class GetNemesisReceiptQueryHandler(IApplicationDbContext context, IBlobStorage blobStorage)
    : IRequestHandler<GetNemesisReceiptQuery, NemesisReceiptDto>
{
    public async Task<NemesisReceiptDto> Handle(GetNemesisReceiptQuery request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        if (expense.ReceiptBlobKey is null)
            throw new NotFoundException("NemesisReceipt", request.ExpenseId);

        var payload = await blobStorage.GetAsync(BlobKeys.NemesisReceipt(request.ExpenseId), cancellationToken);
        var separatorIndex = payload.IndexOf(':');
        var iv = payload[..separatorIndex];
        var encryptedReceipt = payload[(separatorIndex + 1)..];

        return new NemesisReceiptDto(encryptedReceipt, iv);
    }
}
