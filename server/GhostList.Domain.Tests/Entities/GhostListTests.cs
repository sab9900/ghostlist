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
}
