using FluentAssertions;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListWhisperLifetime;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Validators;

public class UpdateGhostListWhisperLifetimeCommandValidatorTests
{
    private readonly UpdateGhostListWhisperLifetimeCommandValidator _validator = new();

    [Theory]
    [InlineData(WhisperLifetime.ThreeSeconds)]
    [InlineData(WhisperLifetime.FiveSeconds)]
    [InlineData(WhisperLifetime.EightSeconds)]
    [InlineData(WhisperLifetime.TwelveSeconds)]
    [InlineData(WhisperLifetime.TwentySeconds)]
    public void Validate_ValidLifetime_Passes(WhisperLifetime lifetime)
    {
        var cmd = new UpdateGhostListWhisperLifetimeCommand(Guid.NewGuid(), lifetime);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_InvalidLifetimeValue_Fails()
    {
        var cmd = new UpdateGhostListWhisperLifetimeCommand(Guid.NewGuid(), (WhisperLifetime)999);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.Lifetime));
    }

    [Fact]
    public void Validate_EmptyListId_Fails()
    {
        var cmd = new UpdateGhostListWhisperLifetimeCommand(Guid.Empty, WhisperLifetime.FiveSeconds);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.ListId));
    }
}
