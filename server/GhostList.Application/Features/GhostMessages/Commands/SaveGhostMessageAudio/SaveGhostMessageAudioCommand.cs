using FluentValidation;
using GhostList.Application.Common;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageAudio;

public record SaveGhostMessageAudioCommand(
    Guid MessageId,
    string EncryptedAudio,
    string AudioInitializationVector) : IRequest;

public class SaveGhostMessageAudioCommandValidator : AbstractValidator<SaveGhostMessageAudioCommand>
{
    public SaveGhostMessageAudioCommandValidator()
    {
        RuleFor(x => x.MessageId).NotEmpty();

        RuleFor(x => x.EncryptedAudio)
            .NotEmpty()
            .MaximumLength(14_000_000);

        RuleFor(x => x.AudioInitializationVector).NotEmpty();
    }
}

public class SaveGhostMessageAudioCommandHandler(IApplicationDbContext context, IBlobStorage blobStorage)
    : IRequestHandler<SaveGhostMessageAudioCommand>
{
    public async Task Handle(SaveGhostMessageAudioCommand request, CancellationToken cancellationToken)
    {
        var exists = await context.GhostChatMessages
            .AnyAsync(m => m.Id == request.MessageId, cancellationToken);

        if (!exists)
            throw new NotFoundException(nameof(GhostChatMessage), request.MessageId);

        var payload = $"{request.AudioInitializationVector}:{request.EncryptedAudio}";
        await blobStorage.SaveAsync(BlobKeys.ChatAudio(request.MessageId), payload, cancellationToken);
    }
}
