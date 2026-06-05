using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class GhostChatMessageTests
{
    private static readonly Guid ListId = Guid.NewGuid();

    [Fact]
    public void Create_SetsAllPropertiesCorrectly()
    {
        var message = GhostChatMessage.Create(ListId, "enc_msg", "msg_iv", "enc_sender", "sender_iv");

        message.Id.Should().NotBeEmpty();
        message.GhostListId.Should().Be(ListId);
        message.EncryptedMessage.Should().Be("enc_msg");
        message.InitializationVector.Should().Be("msg_iv");
        message.EncryptedSenderName.Should().Be("enc_sender");
        message.SenderNameInitializationVector.Should().Be("sender_iv");
    }

    [Fact]
    public void Create_SetsCreatedAtToUtcNow()
    {
        var before = DateTime.UtcNow;
        var message = GhostChatMessage.Create(ListId, "msg", "iv", "sender", "siv");
        var after = DateTime.UtcNow;

        message.CreatedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public void TwoMessages_HaveDifferentIds()
    {
        var a = GhostChatMessage.Create(ListId, "msg", "iv", "sender", "siv");
        var b = GhostChatMessage.Create(ListId, "msg", "iv", "sender", "siv");

        a.Id.Should().NotBe(b.Id);
    }
}
