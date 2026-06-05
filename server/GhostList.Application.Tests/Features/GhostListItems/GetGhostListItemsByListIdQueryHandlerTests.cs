using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.GhostListItems.Queries.GetGhostListItemsByListId;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.GhostListItems;

public class GetGhostListItemsByListIdQueryHandlerTests
{
    [Fact]
    public async Task Handle_ExistingList_ReturnsItemsOrderedByCreatedAt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item1 = GhostListItem.Create(list.Id, "payload_1", "iv1");
        var item2 = GhostListItem.Create(list.Id, "payload_2", "iv2");
        context.GhostLists.Add(list);
        context.GhostListItems.AddRange(item1, item2);
        await context.SaveChangesAsync();

        var handler = new GetGhostListItemsByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostListItemsByListIdQuery(list.Id), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Should().BeInAscendingOrder(i => i.CreatedAt);
    }

    [Fact]
    public async Task Handle_ExistingListNoItems_ReturnsEmptyList()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new GetGhostListItemsByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostListItemsByListIdQuery(list.Id), CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_ItemsFromOtherLists_ReturnsOnlyMatchingItems()
    {
        await using var context = DbContextFactory.Create();
        var listA = Domain.Entities.GhostList.Create();
        var listB = Domain.Entities.GhostList.Create();
        var itemA = GhostListItem.Create(listA.Id, "a_payload", "iv");
        var itemB = GhostListItem.Create(listB.Id, "b_payload", "iv");
        context.GhostLists.AddRange(listA, listB);
        context.GhostListItems.AddRange(itemA, itemB);
        await context.SaveChangesAsync();

        var handler = new GetGhostListItemsByListIdQueryHandler(context);
        var result = await handler.Handle(new GetGhostListItemsByListIdQuery(listA.Id), CancellationToken.None);

        result.Should().HaveCount(1);
        result[0].EncryptedPayload.Should().Be("a_payload");
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new GetGhostListItemsByListIdQueryHandler(context);

        var act = () => handler.Handle(new GetGhostListItemsByListIdQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
