using FluentAssertions;
using GhostList.Application.Features.ListMembers.Commands.MarkItemsRead;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.ListMembers;

public class MarkItemsReadCommandHandlerTests
{
    private static GhostListMember CreateMember(Guid listId, string deviceId) => new()
    {
        Id = Guid.NewGuid(),
        GhostListId = listId,
        DeviceId = deviceId,
        EncryptedPayload = "payload",
        InitializationVector = "iv",
        UpdatedAt = DateTimeOffset.UtcNow
    };

    [Fact]
    public async Task Handle_MarksItemsAsRead_CreatesReceipts()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item1 = GhostListItem.Create(list.Id, "payload1", "iv1");
        var item2 = GhostListItem.Create(list.Id, "payload2", "iv2");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostListItems.AddRange(item1, item2);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new MarkItemsReadCommandHandler(context);
        await handler.Handle(new MarkItemsReadCommand(list.Id, "device1", [item1.Id, item2.Id]), CancellationToken.None);

        var receipts = context.ItemReadReceipts.Where(r => r.DeviceId == "device1").ToList();
        receipts.Should().HaveCount(2);
        receipts.Select(r => r.ItemId).Should().BeEquivalentTo([item1.Id, item2.Id]);
    }

    [Fact]
    public async Task Handle_AdvancesMemberLastReadItemAt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new MarkItemsReadCommandHandler(context);
        await handler.Handle(new MarkItemsReadCommand(list.Id, "device1", [item.Id]), CancellationToken.None);

        var updatedMember = await context.GhostListMembers.FindAsync(member.Id);
        updatedMember!.LastReadItemAt.Should().NotBeNull();
        updatedMember.LastReadItemAt!.Value.UtcDateTime.Should().BeCloseTo(item.CreatedAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Handle_AlreadyReadItem_DoesNotDuplicateReceipt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new MarkItemsReadCommandHandler(context);
        await handler.Handle(new MarkItemsReadCommand(list.Id, "device1", [item.Id]), CancellationToken.None);
        await handler.Handle(new MarkItemsReadCommand(list.Id, "device1", [item.Id]), CancellationToken.None);

        context.ItemReadReceipts.Count(r => r.DeviceId == "device1" && r.ItemId == item.Id).Should().Be(1);
    }

    [Fact]
    public async Task Handle_NoMatchingMember_DoesNothing()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");

        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        await context.SaveChangesAsync();

        var handler = new MarkItemsReadCommandHandler(context);
        await handler.Handle(new MarkItemsReadCommand(list.Id, "unknown-device", [item.Id]), CancellationToken.None);

        context.ItemReadReceipts.Should().BeEmpty();
    }
}
