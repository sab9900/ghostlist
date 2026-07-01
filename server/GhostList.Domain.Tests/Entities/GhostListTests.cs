using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class GhostListTests
{
    [Fact]
    public void Create_SetsDefaultTtlToOneDay()
    {
        var list = Domain.Entities.GhostList.Create();

        list.CompletedItemsTtl.Should().Be(DeleteAfterDuration.OneDay);
    }

    [Fact]
    public void Create_WithExplicitTtl_SetsTtl()
    {
        var list = Domain.Entities.GhostList.Create(DeleteAfterDuration.OneWeek);

        list.CompletedItemsTtl.Should().Be(DeleteAfterDuration.OneWeek);
    }

    [Fact]
    public void Create_AssignsNewId()
    {
        var list = Domain.Entities.GhostList.Create();

        list.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void Create_SetsCreatedAtToUtcNow()
    {
        var before = DateTime.UtcNow;
        var list = Domain.Entities.GhostList.Create();
        var after = DateTime.UtcNow;

        list.CreatedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public void Create_InitializesEmptyCollections()
    {
        var list = Domain.Entities.GhostList.Create();

        list.Items.Should().BeEmpty();
        list.ChatMessages.Should().BeEmpty();
    }

    [Fact]
    public void UpdateTtl_ChangesTtl()
    {
        var list = Domain.Entities.GhostList.Create(DeleteAfterDuration.OneDay);

        list.UpdateTtl(DeleteAfterDuration.ThreeDays);

        list.CompletedItemsTtl.Should().Be(DeleteAfterDuration.ThreeDays);
    }

    [Fact]
    public void Create_SetsDefaultWhisperLifetimeToFiveSeconds()
    {
        var list = Domain.Entities.GhostList.Create();

        list.WhisperLifetimeSeconds.Should().Be(WhisperLifetime.FiveSeconds);
    }

    [Fact]
    public void Create_WithExplicitWhisperLifetime_SetsWhisperLifetime()
    {
        var list = Domain.Entities.GhostList.Create(whisperLifetime: WhisperLifetime.TwelveSeconds);

        list.WhisperLifetimeSeconds.Should().Be(WhisperLifetime.TwelveSeconds);
    }

    [Fact]
    public void UpdateWhisperLifetime_ChangesWhisperLifetime()
    {
        var list = Domain.Entities.GhostList.Create();

        list.UpdateWhisperLifetime(WhisperLifetime.TwentySeconds);

        list.WhisperLifetimeSeconds.Should().Be(WhisperLifetime.TwentySeconds);
    }

    [Fact]
    public void CreateListItem_ReturnsItemWithCorrectListId()
    {
        var list = Domain.Entities.GhostList.Create();

        var item = list.CreateListItem("enc_payload", "iv");

        item.GhostListId.Should().Be(list.Id);
        item.EncryptedPayload.Should().Be("enc_payload");
        item.InitializationVector.Should().Be("iv");
        item.IsChecked.Should().BeFalse();
    }

    [Fact]
    public void CreateMessage_ReturnsMessageWithCorrectListId()
    {
        var list = Domain.Entities.GhostList.Create();

        var message = list.CreateMessage("enc_msg", "msg_iv", "enc_sender", "sender_iv");

        message.GhostListId.Should().Be(list.Id);
        message.EncryptedMessage.Should().Be("enc_msg");
        message.InitializationVector.Should().Be("msg_iv");
        message.EncryptedSenderName.Should().Be("enc_sender");
        message.SenderNameInitializationVector.Should().Be("sender_iv");
    }

    [Fact]
    public void TwoCreatedLists_HaveDifferentIds()
    {
        var a = Domain.Entities.GhostList.Create();
        var b = Domain.Entities.GhostList.Create();

        a.Id.Should().NotBe(b.Id);
    }

    [Fact]
    public void Create_SetsDefaultNemesisSettlementExpiryDaysTo60()
    {
        var list = Domain.Entities.GhostList.Create();

        list.NemesisSettlementExpiryDays.Should().Be(60);
    }

    [Fact]
    public void Create_SetsDefaultNemesisSettlementHideAfterDaysTo30()
    {
        var list = Domain.Entities.GhostList.Create();

        list.NemesisSettlementHideAfterDays.Should().Be(30);
    }

    [Fact]
    public void UpdateNemesisSettings_ChangesExpiryAndHideDays()
    {
        var list = Domain.Entities.GhostList.Create();

        list.UpdateNemesisSettings(90, 14);

        list.NemesisSettlementExpiryDays.Should().Be(90);
        list.NemesisSettlementHideAfterDays.Should().Be(14);
    }

    [Fact]
    public void UpdateNemesisSettings_WithZeroExpiryDays_ThrowsArgumentOutOfRangeException()
    {
        var list = Domain.Entities.GhostList.Create();

        var act = () => list.UpdateNemesisSettings(0, 14);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void UpdateNemesisSettings_WithNegativeHideAfterDays_ThrowsArgumentOutOfRangeException()
    {
        var list = Domain.Entities.GhostList.Create();

        var act = () => list.UpdateNemesisSettings(60, -1);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void UpdateNemesisSettings_WithZeroHideAfterDays_Succeeds()
    {
        var list = Domain.Entities.GhostList.Create();

        list.UpdateNemesisSettings(60, 0);

        list.NemesisSettlementHideAfterDays.Should().Be(0);
    }
}
