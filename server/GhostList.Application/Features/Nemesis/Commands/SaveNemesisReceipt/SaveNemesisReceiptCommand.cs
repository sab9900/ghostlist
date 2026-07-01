using FluentValidation;
using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.SaveNemesisReceipt;

public record SaveNemesisReceiptCommand(
    Guid ExpenseId,
    string EncryptedReceipt,
    string ReceiptIv) : IRequest;

public class SaveNemesisReceiptCommandValidator : AbstractValidator<SaveNemesisReceiptCommand>
{
    public SaveNemesisReceiptCommandValidator()
    {
        RuleFor(x => x.ExpenseId).NotEmpty();
        RuleFor(x => x.EncryptedReceipt).NotEmpty().MaximumLength(3_500_000);
        RuleFor(x => x.ReceiptIv).NotEmpty();
    }
}

public class SaveNemesisReceiptCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage)
    : IRequestHandler<SaveNemesisReceiptCommand>
{
    public async Task Handle(SaveNemesisReceiptCommand request, CancellationToken cancellationToken)
    {
        var expense = await context.NemesisExpenses
            .FirstOrDefaultAsync(e => e.Id == request.ExpenseId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.Entities.NemesisExpense), request.ExpenseId);

        var blobKey = BlobKeys.NemesisReceipt(request.ExpenseId);
        var payload = $"{request.ReceiptIv}:{request.EncryptedReceipt}";

        await blobStorage.SaveAsync(blobKey, payload, cancellationToken);

        expense.AttachReceipt(request.ReceiptIv, blobKey);
        await context.SaveChangesAsync(cancellationToken);
    }
}
