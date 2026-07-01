using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class NemesisSettlementTests
{
    [Fact]
    public void Create_SetsPaidByPayerToTrue()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.IsPaidByPayer.Should().BeTrue();
    }

    [Fact]
    public void Create_SetsIsConfirmedByReceiverToFalse()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.IsConfirmedByReceiver.Should().BeFalse();
    }

    [Fact]
    public void Create_SetsPaidAtToUtcNow()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        var after = DateTime.UtcNow;

        settlement.PaidAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public void Create_ConfirmedAtIsNull()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.ConfirmedAt.Should().BeNull();
    }

    [Fact]
    public void Create_AssignsNewId()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void ConfirmReceipt_SetsIsConfirmedByReceiverToTrue()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.ConfirmReceipt();

        settlement.IsConfirmedByReceiver.Should().BeTrue();
    }

    [Fact]
    public void ConfirmReceipt_SetsConfirmedAt()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.ConfirmReceipt();

        settlement.ConfirmedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void ConfirmReceipt_CalledTwice_ThrowsInvalidOperationException()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        settlement.ConfirmReceipt();

        var act = () => settlement.ConfirmReceipt();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void TwoSettlements_HaveDifferentIds()
    {
        var a = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        var b = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        a.Id.Should().NotBe(b.Id);
    }
}
