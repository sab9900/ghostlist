using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class NemesisExpenseTests
{
    [Fact]
    public void Create_WithPositiveSplitCount_SetsStatusToPending()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.Status.Should().Be(VerificationStatus.Pending);
        expense.IsArchived.Should().BeFalse();
    }

    [Fact]
    public void Create_WithZeroSplitCount_IsImmediatelyVerifiedAndArchived()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 0);

        expense.Status.Should().Be(VerificationStatus.Verified);
        expense.IsArchived.Should().BeTrue();
    }

    [Fact]
    public void Create_AssignsNewId()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);

        expense.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void Create_SetsEncryptedPayloadAndIv()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "ciphertext", "nonce", splitCount: 1);

        expense.EncryptedPayload.Should().Be("ciphertext");
        expense.PayloadInitializationVector.Should().Be("nonce");
    }

    [Fact]
    public void Create_StartsWithEmptyVerifications()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.Verifications.Should().BeEmpty();
    }

    [Fact]
    public void TwoExpenses_HaveDifferentIds()
    {
        var a = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);
        var b = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);

        a.Id.Should().NotBe(b.Id);
    }

    [Fact]
    public void AddVerification_AddsVerification()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.AddVerification("user1");

        expense.Verifications.Should().HaveCount(1);
        expense.Verifications[0].VerifiedByUserId.Should().Be("user1");
    }

    [Fact]
    public void AddVerification_PartialVerification_RemainsAsPending()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.AddVerification("user1");

        expense.Status.Should().Be(VerificationStatus.Pending);
    }

    [Fact]
    public void AddVerification_WhenAllNonPayerSplitMembersVerified_PromotesToVerifiedAndArchives()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.AddVerification("user1");
        expense.AddVerification("user2");

        expense.Status.Should().Be(VerificationStatus.Verified);
        expense.IsArchived.Should().BeTrue();
    }

    [Fact]
    public void AddVerification_DuplicateUser_IsIgnored()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 2);

        expense.AddVerification("user1");
        expense.AddVerification("user1");

        expense.Verifications.Should().HaveCount(1);
    }

    [Fact]
    public void AddVerification_OnVerifiedExpense_ThrowsInvalidOperationException()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);
        expense.AddVerification("user1");

        var act = () => expense.AddVerification("user2");

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void AddVerification_OnRejectedExpense_ThrowsInvalidOperationException()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);
        expense.Reject();

        var act = () => expense.AddVerification("user1");

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Reject_SetsStatusToRejected()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);

        expense.Reject();

        expense.Status.Should().Be(VerificationStatus.Rejected);
    }

    [Fact]
    public void Reject_OnVerifiedExpense_ThrowsInvalidOperationException()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);
        expense.AddVerification("user1");

        var act = () => expense.Reject();

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Archive_SetsIsArchivedToTrue()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);
        expense.Reject();

        expense.Archive();

        expense.IsArchived.Should().BeTrue();
    }

    [Fact]
    public void AttachReceipt_SetsReceiptFields()
    {
        var expense = NemesisExpense.Create(Guid.NewGuid(), "enc", "iv", splitCount: 1);

        expense.AttachReceipt("enc_receipt_key", "receipts/abc123");

        expense.EncryptedReceiptKey.Should().Be("enc_receipt_key");
        expense.ReceiptBlobKey.Should().Be("receipts/abc123");
    }
}
