using FluentValidation;
using GhostList.Domain.Entities;

namespace GhostList.Application.Features.GhostLists.Commands.UpdateGhostListWhisperLifetime;

public class UpdateGhostListWhisperLifetimeCommandValidator : AbstractValidator<UpdateGhostListWhisperLifetimeCommand>
{
    public UpdateGhostListWhisperLifetimeCommandValidator()
    {
        RuleFor(x => x.ListId)
            .NotEmpty();

        RuleFor(x => x.Lifetime)
            .IsInEnum()
            .WithMessage("Invalid whisper lifetime value. Please use an allowed duration.");
    }
}
