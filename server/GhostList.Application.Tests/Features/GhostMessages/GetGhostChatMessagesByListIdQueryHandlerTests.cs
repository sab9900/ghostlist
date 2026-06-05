using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.GhostMessages;

public class GetGhostChatMessagesByListIdQueryHandlerTests
{
    [Fact]
    public async Task Handle_ExistingList_ReturnsMessagesOrderedByCreatedAt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var msg1 = GhostChatMessage.Create(list.Id, "msg_1", "iv1", "sender", "siv");
        var msg2 = GhostChatMessage.Create(list.Id, "msg_2", "iv2", "sender", "siv");
        context.GhostLists.Add(list);
        context.GhostChatMessages.AddRange(msg1, msg2);
        await context.SaveChangesAsync();

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Should().BeInAscendingOrder(m => m.CreatedAt);
    }

    [Fact]
    public async Task Handle_ExistingListNoMessages_ReturnsEmptyList()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id), CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_MessagesFromOtherLists_ReturnsOnlyMatchingMessages()
    {
        await using var context = DbContextFactory.Create();
        var listA = Domain.Entities.GhostList.Create();
        var listB = Domain.Entities.GhostList.Create();
        var msgA = GhostChatMessage.Create(listA.Id, "msg_a", "iv", "sender", "siv");
        var msgB = GhostChatMessage.Create(listB.Id, "msg_b", "iv", "sender", "siv");
        context.GhostLists.AddRange(listA, listB);
        context.GhostChatMessages.AddRange(msgA, msgB);
        await context.SaveChangesAsync();

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(listA.Id), CancellationToken.None);

        result.Should().HaveCount(1);
        result[0].EncryptedMessage.Should().Be("msg_a");
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);

        var act = () => handler.Handle(new GetGhostChatMessagesByListIdQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
