using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class GhostListItemTests
{
    private static readonly Guid ListId = Guid.NewGuid();

    [Fact]
    public void Create_SetsPropertiesCorrectly()
    {
        var item = GhostListItem.Create(ListId, "enc_payload", "iv");

        item.Id.Should().NotBeEmpty();
        item.GhostListId.Should().Be(ListId);
        item.EncryptedPayload.Should().Be("enc_payload");
        item.InitializationVector.Should().Be("iv");
        item.IsChecked.Should().BeFalse();
        item.CheckedAt.Should().BeNull();
    }

    [Fact]
    public void Create_SetsCreatedAtToUtcNow()
    {
        var before = DateTime.UtcNow;
        var item = GhostListItem.Create(ListId, "payload", "iv");
        var after = DateTime.UtcNow;

        item.CreatedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public void ToggleChecked_WhenUnchecked_SetsCheckedTrueAndSetsCheckedAt()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");
        var before = DateTime.UtcNow;

        item.ToggleChecked();

        item.IsChecked.Should().BeTrue();
        item.CheckedAt.Should().NotBeNull();
        item.CheckedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void ToggleChecked_WhenChecked_SetsCheckedFalseAndClearsCheckedAt()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");
        item.ToggleChecked();

        item.ToggleChecked();

        item.IsChecked.Should().BeFalse();
        item.CheckedAt.Should().BeNull();
    }

    [Fact]
    public void ToggleChecked_CalledTwice_RestoresToOriginalState()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");

        item.ToggleChecked();
        item.ToggleChecked();

        item.IsChecked.Should().BeFalse();
        item.CheckedAt.Should().BeNull();
    }

    [Fact]
    public void Create_DefaultPriorityIsNone()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");

        item.Priority.Should().Be(ItemPriority.None);
    }

    [Fact]
    public void SetPriority_Important_SetsPriorityToImportant()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");

        item.SetPriority(ItemPriority.Important);

        item.Priority.Should().Be(ItemPriority.Important);
    }

    [Fact]
    public void SetPriority_Optional_SetsPriorityToOptional()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");

        item.SetPriority(ItemPriority.Optional);

        item.Priority.Should().Be(ItemPriority.Optional);
    }

    [Fact]
    public void SetPriority_None_ClearsPriority()
    {
        var item = GhostListItem.Create(ListId, "payload", "iv");
        item.SetPriority(ItemPriority.Important);

        item.SetPriority(ItemPriority.None);

        item.Priority.Should().Be(ItemPriority.None);
    }
}
