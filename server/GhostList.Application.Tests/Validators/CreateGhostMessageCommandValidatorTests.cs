using FluentAssertions;
using GhostList.Application.Features.GhostMessages.Commands.CreateGhostChatMessage;

namespace GhostList.Application.Tests.Validators;

public class CreateGhostMessageCommandValidatorTests
{
    private readonly CreateGhostMessageCommandValidator _validator = new();

    private static CreateGhostMessageCommand ValidCommand() => new(
        GhostListId: Guid.NewGuid(),
        EncryptedMessage: "enc_message",
        MessageInitializationVector: "msg_iv",
        EncryptedSenderName: "enc_sender",
        SenderNameInitializationVector: "sender_iv");

    [Fact]
    public void Validate_ValidCommand_Passes()
    {
        var result = _validator.Validate(ValidCommand());

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmptyGhostListId_Fails()
    {
        var cmd = ValidCommand() with { GhostListId = Guid.Empty };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.GhostListId));
    }

    [Fact]
    public void Validate_EmptyEncryptedMessage_Fails()
    {
        var cmd = ValidCommand() with { EncryptedMessage = "" };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.EncryptedMessage));
    }

    [Fact]
    public void Validate_EncryptedMessageTooLong_Fails()
    {
        var cmd = ValidCommand() with { EncryptedMessage = new string('x', 4001) };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.EncryptedMessage));
    }

    [Fact]
    public void Validate_EncryptedMessageAtMaxLength_Passes()
    {
        var cmd = ValidCommand() with { EncryptedMessage = new string('x', 4000) };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_EmptyMessageInitializationVector_Fails()
    {
        var cmd = ValidCommand() with { MessageInitializationVector = "" };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.MessageInitializationVector));
    }

    [Fact]
    public void Validate_EmptyEncryptedSenderName_Fails()
    {
        var cmd = ValidCommand() with { EncryptedSenderName = "" };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.EncryptedSenderName));
    }

    [Fact]
    public void Validate_EncryptedSenderNameTooLong_Fails()
    {
        var cmd = ValidCommand() with { EncryptedSenderName = new string('x', 501) };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.EncryptedSenderName));
    }

    [Fact]
    public void Validate_EmptySenderNameInitializationVector_Fails()
    {
        var cmd = ValidCommand() with { SenderNameInitializationVector = "" };

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.SenderNameInitializationVector));
    }
}
