using FluentValidation;

namespace GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;

public class CreateGhostMessageCommandValidator : AbstractValidator<CreateGhostMessageCommand>
{
    public CreateGhostMessageCommandValidator()
    {
        RuleFor(x => x.GhostListId)
            .NotEmpty();

        RuleFor(x => x.EncryptedMessage)
            .NotEmpty()
            .MaximumLength(4000);

        RuleFor(x => x.MessageInitializationVector)
            .NotEmpty();

        RuleFor(x => x.EncryptedSenderName)
            .NotEmpty()
            .MaximumLength(500);

        RuleFor(x => x.SenderNameInitializationVector)
            .NotEmpty();
    }
}
