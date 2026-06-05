using FluentAssertions;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListTtl;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Validators;

public class UpdateGhostListTtlCommandValidatorTests
{
    private readonly UpdateGhostListTtlCommandValidator _validator = new();

    [Theory]
    [InlineData(DeleteAfterDuration.Immediately)]
    [InlineData(DeleteAfterDuration.OneHour)]
    [InlineData(DeleteAfterDuration.SixHours)]
    [InlineData(DeleteAfterDuration.TwelveHours)]
    [InlineData(DeleteAfterDuration.OneDay)]
    [InlineData(DeleteAfterDuration.ThreeDays)]
    [InlineData(DeleteAfterDuration.OneWeek)]
    [InlineData(DeleteAfterDuration.OneMonth)]
    [InlineData(DeleteAfterDuration.ThreeMonths)]
    public void Validate_ValidTtl_Passes(DeleteAfterDuration ttl)
    {
        var cmd = new UpdateGhostListTtlCommand(Guid.NewGuid(), ttl);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_InvalidTtlValue_Fails()
    {
        var cmd = new UpdateGhostListTtlCommand(Guid.NewGuid(), (DeleteAfterDuration)999);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.Ttl));
    }

    [Fact]
    public void Validate_EmptyListId_Fails()
    {
        var cmd = new UpdateGhostListTtlCommand(Guid.Empty, DeleteAfterDuration.OneDay);

        var result = _validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(cmd.ListId));
    }
}
