using FluentAssertions;
using GhostList.Application.Features.GhostLists.Queries.GetGhostListById;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.GhostLists;

public class GetGhostListByIdQueryHandlerTests
{
    [Fact]
    public async Task Handle_ExistingList_ReturnsCorrectDto()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create(DeleteAfterDuration.SixHours);
        var item = GhostListItem.Create(list.Id, "enc_payload", "iv");
        var msg = GhostChatMessage.Create(list.Id, "enc_msg", "msg_iv", "enc_sender", "sender_iv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        context.GhostChatMessages.Add(msg);
        await context.SaveChangesAsync();

        var handler = new GetGhostListByIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostListByIdQuery(list.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Id.Should().Be(list.Id);
        result.Ttl.Should().Be((int)DeleteAfterDuration.SixHours);
        result.Items.Should().HaveCount(1);
        result.Items[0].EncryptedPayload.Should().Be("enc_payload");
        result.ChatMessages.Should().HaveCount(1);
        result.ChatMessages[0].EncryptedMessage.Should().Be("enc_msg");
    }

    [Fact]
    public async Task Handle_NonExistentList_ReturnsNull()
    {
        await using var context = DbContextFactory.Create();
        var handler = new GetGhostListByIdQueryHandler(context);

        var result = await handler.Handle(new GetGhostListByIdQuery(Guid.NewGuid()), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_ListWithNoItems_ReturnsEmptyCollections()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new GetGhostListByIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostListByIdQuery(list.Id), CancellationToken.None);

        result!.Items.Should().BeEmpty();
        result.ChatMessages.Should().BeEmpty();
    }
}
