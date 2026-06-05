using FluentValidation;
using GhostList.Domain.Entities;

namespace GhostList.Application.Features.GhostLists.Commands.UpdateGhostListTtl;

public class UpdateGhostListTtlCommandValidator : AbstractValidator<UpdateGhostListTtlCommand>
{
    public UpdateGhostListTtlCommandValidator()
    {
        RuleFor(x => x.ListId)
            .NotEmpty();

        RuleFor(x => x.Ttl)
            .IsInEnum()
            .WithMessage("Invalid TTL value. Please use an allowed duration.");
    }
}
