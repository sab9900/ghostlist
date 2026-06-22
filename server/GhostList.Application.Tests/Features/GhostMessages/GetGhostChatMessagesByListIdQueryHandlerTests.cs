using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.GhostMessages.Queries.GetGhostChatMessagesByListId;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.GhostMessages;

public class GetGhostChatMessagesByListIdQueryHandlerTests
{
    [Fact]
    public async Task Handle_ExistingList_ReturnsMessagesOrderedByCreatedAtAscending()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var msg1 = GhostChatMessage.Create(list.Id, "msg_1", "iv1", "sender", "siv");
        var msg2 = GhostChatMessage.Create(list.Id, "msg_2", "iv2", "sender", "siv");
        context.GhostChatMessages.AddRange(msg1, msg2);
        await context.SaveChangesAsync();

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id), CancellationToken.None);

        result.Messages.Should().HaveCount(2);
        result.Messages.Should().BeInAscendingOrder(m => m.CreatedAt);
        result.HasMore.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_ExistingListNoMessages_ReturnsEmptyPage()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id), CancellationToken.None);

        result.Messages.Should().BeEmpty();
        result.HasMore.Should().BeFalse();
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

        result.Messages.Should().HaveCount(1);
        result.Messages[0].EncryptedMessage.Should().Be("msg_a");
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);

        var act = () => handler.Handle(new GetGhostChatMessagesByListIdQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_MoreMessagesThanPageSize_ReturnsLatestPageAndHasMoreTrue()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        for (var i = 0; i < 5; i++)
        {
            var message = GhostChatMessage.Create(list.Id, $"msg_{i}", "iv", "sender", "siv");
            context.GhostChatMessages.Add(message);
            await context.SaveChangesAsync();
            await Task.Delay(2);
        }

        var handler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id, Take: 3), CancellationToken.None);

        result.Messages.Should().HaveCount(3);
        result.Messages.Select(m => m.EncryptedMessage).Should().ContainInOrder("msg_2", "msg_3", "msg_4");
        result.HasMore.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_BeforeCursor_ReturnsOlderMessagesOnly()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        for (var i = 0; i < 5; i++)
        {
            var message = GhostChatMessage.Create(list.Id, $"msg_{i}", "iv", "sender", "siv");
            context.GhostChatMessages.Add(message);
            await context.SaveChangesAsync();
            await Task.Delay(2);
        }

        var firstPageHandler = new GetGhostChatMessagesByListIdQueryHandler(context);
        var firstPage = await firstPageHandler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id, Take: 3), CancellationToken.None);
        var oldestLoaded = firstPage.Messages.First().CreatedAt;

        var secondPage = await firstPageHandler.Handle(new GetGhostChatMessagesByListIdQuery(list.Id, Before: oldestLoaded, Take: 3), CancellationToken.None);

        secondPage.Messages.Should().HaveCount(2);
        secondPage.Messages.Select(m => m.EncryptedMessage).Should().ContainInOrder("msg_0", "msg_1");
        secondPage.HasMore.Should().BeFalse();
        secondPage.Messages.Should().OnlyContain(m => m.CreatedAt < oldestLoaded);
    }
}
