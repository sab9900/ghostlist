using FluentValidation;
using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageImage;

public record SaveGhostMessageImageCommand(
    Guid MessageId,
    string EncryptedImage,
    string ImageInitializationVector) : IRequest;

public class SaveGhostMessageImageCommandValidator : AbstractValidator<SaveGhostMessageImageCommand>
{
    public SaveGhostMessageImageCommandValidator()
    {
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedImage)
            .NotEmpty()
            .MaximumLength(3_500_000);

        RuleFor(x => x.ImageInitializationVector).NotEmpty();
    }
}

public class SaveGhostMessageImageCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage)
    : IRequestHandler<SaveGhostMessageImageCommand>
{
    public async Task Handle(SaveGhostMessageImageCommand request, CancellationToken cancellationToken)
    {
        var exists = await context.GhostChatMessages
            .AnyAsync(m => m.Id == request.MessageId, cancellationToken);

        if (!exists)
            throw new NotFoundException(nameof(GhostChatMessage), request.MessageId);

        var payload = $"{request.ImageInitializationVector}:{request.EncryptedImage}";
        await blobStorage.SaveAsync(BlobKeys.ChatImage(request.MessageId), payload, cancellationToken);
    }
}
