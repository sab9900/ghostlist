using FluentValidation;
using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageVideo;

public record SaveGhostMessageVideoCommand(
    Guid MessageId,
    string EncryptedVideo,
    string VideoInitializationVector) : IRequest;

public class SaveGhostMessageVideoCommandValidator : AbstractValidator<SaveGhostMessageVideoCommand>
{
    public SaveGhostMessageVideoCommandValidator()
    {
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedVideo)
            .NotEmpty()
            .MaximumLength(28_000_000);

        RuleFor(x => x.VideoInitializationVector).NotEmpty();
    }
}

public class SaveGhostMessageVideoCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage)
    : IRequestHandler<SaveGhostMessageVideoCommand>
{
    public async Task Handle(SaveGhostMessageVideoCommand request, CancellationToken cancellationToken)
    {
        var exists = await context.GhostChatMessages
            .AnyAsync(m => m.Id == request.MessageId, cancellationToken);

        if (!exists)
            throw new NotFoundException(nameof(GhostChatMessage), request.MessageId);

        var payload = $"{request.VideoInitializationVector}:{request.EncryptedVideo}";
        await blobStorage.SaveAsync(BlobKeys.ChatVideo(request.MessageId), payload, cancellationToken);
    }
}
