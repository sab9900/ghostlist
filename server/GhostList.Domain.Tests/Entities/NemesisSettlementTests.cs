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

    [Fact]
    public void Create_SetsStatusToPending()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Status.Should().Be(SettlementStatus.Pending);
    }

    [Fact]
    public void Decline_SetsStatusToDeclined()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Decline();

        settlement.Status.Should().Be(SettlementStatus.Declined);
    }

    [Fact]
    public void Decline_SetsResolvedAt()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Decline();

        settlement.ResolvedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void Decline_WhenNotPending_ThrowsInvalidOperationException()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        settlement.ConfirmReceipt();

        var act = () => settlement.Decline();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Expire_SetsStatusToExpired()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Expire();

        settlement.Status.Should().Be(SettlementStatus.Expired);
    }

    [Fact]
    public void Expire_SetsResolvedAt()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Expire();

        settlement.ResolvedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void Expire_WhenNotPending_ThrowsInvalidOperationException()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        settlement.Decline();

        var act = () => settlement.Expire();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Void_SetsStatusToVoided()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Void();

        settlement.Status.Should().Be(SettlementStatus.Voided);
    }

    [Fact]
    public void Void_SetsResolvedAt()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Void();

        settlement.ResolvedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void Void_WhenNotPending_ThrowsInvalidOperationException()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        settlement.Forgive();

        var act = () => settlement.Void();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Forgive_SetsStatusToForgiven()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Forgive();

        settlement.Status.Should().Be(SettlementStatus.Forgiven);
    }

    [Fact]
    public void Forgive_SetsResolvedAt()
    {
        var before = DateTime.UtcNow;
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");

        settlement.Forgive();

        settlement.ResolvedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void Forgive_WhenNotPending_ThrowsInvalidOperationException()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv");
        settlement.ConfirmReceipt();

        var act = () => settlement.Forgive();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Create_WithReceiverUserId_StoresIt()
    {
        var settlement = NemesisSettlement.Create(Guid.NewGuid(), "enc", "iv", receiverUserId: "user42");

        settlement.ReceiverUserId.Should().Be("user42");
    }
}
