using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.ListMembers.Commands.MarkMessagesRead;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.ListMembers;

public class MarkMessagesReadCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyReadReceiptUpdated(Arg.Any<Guid>(), Arg.Any<ReadReceiptUpdatedNotification>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

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
    public async Task Handle_MarksMessagesAsRead_CreatesReceipts()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var message1 = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv");
        var message2 = GhostChatMessage.Create(list.Id, "enc2", "iv2", "encName2", "nameIv2");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostChatMessages.AddRange(message1, message2);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new MarkMessagesReadCommandHandler(context, MockNotifier());
        await handler.Handle(new MarkMessagesReadCommand(list.Id, "device1", [message1.Id, message2.Id]), CancellationToken.None);

        var receipts = context.MessageReadReceipts.Where(r => r.DeviceId == "device1").ToList();
        receipts.Should().HaveCount(2);
        receipts.Select(r => r.MessageId).Should().BeEquivalentTo([message1.Id, message2.Id]);
    }

    [Fact]
    public async Task Handle_AdvancesMemberLastReadMessageAt_AndNotifies()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var message = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(message);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new MarkMessagesReadCommandHandler(context, notifier);
        await handler.Handle(new MarkMessagesReadCommand(list.Id, "device1", [message.Id]), CancellationToken.None);

        var updatedMember = await context.GhostListMembers.FindAsync(member.Id);
        updatedMember!.LastReadMessageAt.Should().NotBeNull();
        updatedMember.LastReadMessageAt!.Value.UtcDateTime.Should().BeCloseTo(message.CreatedAt, TimeSpan.FromSeconds(1));

        await notifier.Received(1).NotifyReadReceiptUpdated(list.Id, Arg.Any<ReadReceiptUpdatedNotification>());
    }

    [Fact]
    public async Task Handle_AlreadyReadMessage_DoesNotDuplicateReceiptOrRenotify()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var message = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv");
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(message);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var handler = new MarkMessagesReadCommandHandler(context, MockNotifier());
        await handler.Handle(new MarkMessagesReadCommand(list.Id, "device1", [message.Id]), CancellationToken.None);

        var notifier = MockNotifier();
        var secondHandler = new MarkMessagesReadCommandHandler(context, notifier);
        await secondHandler.Handle(new MarkMessagesReadCommand(list.Id, "device1", [message.Id]), CancellationToken.None);

        context.MessageReadReceipts.Count(r => r.DeviceId == "device1" && r.MessageId == message.Id).Should().Be(1);
        await notifier.DidNotReceive().NotifyReadReceiptUpdated(Arg.Any<Guid>(), Arg.Any<ReadReceiptUpdatedNotification>());
    }

    [Fact]
    public async Task Handle_NoMatchingMember_DoesNothing()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var message = GhostChatMessage.Create(list.Id, "enc", "iv", "encName", "nameIv");

        context.GhostLists.Add(list);
        context.GhostChatMessages.Add(message);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new MarkMessagesReadCommandHandler(context, notifier);
        await handler.Handle(new MarkMessagesReadCommand(list.Id, "unknown-device", [message.Id]), CancellationToken.None);

        context.MessageReadReceipts.Should().BeEmpty();
        await notifier.DidNotReceive().NotifyReadReceiptUpdated(Arg.Any<Guid>(), Arg.Any<ReadReceiptUpdatedNotification>());
    }
}
