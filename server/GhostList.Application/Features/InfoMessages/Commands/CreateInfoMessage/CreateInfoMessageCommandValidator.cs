using FluentValidation;

namespace GhostList.Application.Features.InfoMessages.Commands.CreateInfoMessage;

public class CreateInfoMessageCommandValidator : AbstractValidator<CreateInfoMessageCommand>
{
    public CreateInfoMessageCommandValidator()
    {
        RuleFor(x => x.Type)
            .IsInEnum();

        RuleFor(x => x.Title)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.Body)
            .NotEmpty()
            .MaximumLength(4000);

        RuleFor(x => x.TargetPlatform)
            .IsInEnum()
            .When(x => x.TargetPlatform.HasValue);
    }
}
