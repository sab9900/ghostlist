using FluentAssertions;
using GhostList.Application.Features.ListMembers.Commands.MarkItemsRead;
using GhostList.Application.Features.ListMembers.Commands.MarkMessagesRead;
using GhostList.Application.Features.ListMembers.Queries;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;
using GhostList.Application.Common.Interfaces;

namespace GhostList.Application.Tests.Features.ListMembers;

public class GetGhostListUnreadSummaryQueryHandlerTests
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
    public async Task Handle_NoReceipts_AllOthersMessagesAndItemsAreUnread()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var ownMessage = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv", senderDeviceId: "device1");
        var otherMessage = GhostChatMessage.Create(list.Id, "enc2", "iv2", "encName2", "nameIv2", senderDeviceId: "device2");
        var ownItem = GhostListItem.Create(list.Id, "payload", "iv", senderDeviceId: "device1");
        var otherItem = GhostListItem.Create(list.Id, "payload2", "iv2", senderDeviceId: "device2");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostChatMessages.AddRange(ownMessage, otherMessage);
        context.GhostListItems.AddRange(ownItem, otherItem);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new GetGhostListUnreadSummaryQueryHandler(context);
        var result = await handler.Handle(new GetGhostListUnreadSummaryQuery(list.Id, "device1"), CancellationToken.None);

        result.UnreadMessageCount.Should().Be(1);
        result.UnreadMessageIds.Should().BeEquivalentTo([otherMessage.Id]);
        result.UnreadItemCount.Should().Be(1);
        result.UnreadItemIds.Should().BeEquivalentTo([otherItem.Id]);
    }

    [Fact]
    public async Task Handle_AfterMarkingRead_NoLongerCountedAsUnread()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var message = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv", senderDeviceId: "device2");
        var item = GhostListItem.Create(list.Id, "payload", "iv", senderDeviceId: "device2");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(message);
        context.GhostListItems.Add(item);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var notifier = Substitute.For<IGhostListNotifier>();
        var markMessages = new MarkMessagesReadCommandHandler(context, notifier);
        await markMessages.Handle(new MarkMessagesReadCommand(list.Id, "device1", [message.Id]), CancellationToken.None);

        var markItems = new MarkItemsReadCommandHandler(context);
        await markItems.Handle(new MarkItemsReadCommand(list.Id, "device1", [item.Id]), CancellationToken.None);

        var handler = new GetGhostListUnreadSummaryQueryHandler(context);
        var result = await handler.Handle(new GetGhostListUnreadSummaryQuery(list.Id, "device1"), CancellationToken.None);

        result.UnreadMessageCount.Should().Be(0);
        result.UnreadMessageIds.Should().BeEmpty();
        result.UnreadItemCount.Should().Be(0);
        result.UnreadItemIds.Should().BeEmpty();
        result.LastReadMessageAt.Should().NotBeNull();
        result.LastReadItemAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_OwnUserId_OnDifferentDevice_NotCountedAsUnread()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var messageFromOtherDevice = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv", senderDeviceId: "device2", senderUserId: "user1");
        var member = CreateMember(list.Id, "device1");
        member.UserId = "user1";

        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(messageFromOtherDevice);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new GetGhostListUnreadSummaryQueryHandler(context);
        var result = await handler.Handle(new GetGhostListUnreadSummaryQuery(list.Id, "device1", "user1"), CancellationToken.None);

        result.UnreadMessageCount.Should().Be(0);
        result.UnreadMessageIds.Should().BeEmpty();
    }
}
