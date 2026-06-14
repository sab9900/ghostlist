using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.Charon.Commands.MarkCharonDropViewed;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Charon;

public class MarkCharonDropViewedCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyCharonDropDeleted(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns(Task.CompletedTask);
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
    public async Task Handle_NonExistentDrop_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new MarkCharonDropViewedCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new MarkCharonDropViewedCommand(Guid.NewGuid(), "device1"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_OneOfMultipleRecipientsViews_KeepsDropAlive()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv", senderDeviceId: "sender");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.GhostListMembers.AddRange(
            CreateMember(list.Id, "sender"),
            CreateMember(list.Id, "recipient1"),
            CreateMember(list.Id, "recipient2"));
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new MarkCharonDropViewedCommandHandler(context, notifier);
        await handler.Handle(new MarkCharonDropViewedCommand(drop.Id, "recipient1"), CancellationToken.None);

        (await context.CharonDrops.AnyAsync(d => d.Id == drop.Id)).Should().BeTrue();
        (await context.CharonViewReceipts.AnyAsync(r => r.DropId == drop.Id && r.DeviceId == "recipient1")).Should().BeTrue();
        await notifier.DidNotReceive().NotifyCharonDropDeleted(Arg.Any<Guid>(), Arg.Any<Guid>());
    }

    [Fact]
    public async Task Handle_LastRecipientViews_BurnsDropAndNotifies()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv", senderDeviceId: "sender");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.GhostListMembers.AddRange(
            CreateMember(list.Id, "sender"),
            CreateMember(list.Id, "recipient1"),
            CreateMember(list.Id, "recipient2"));
        context.CharonViewReceipts.Add(new CharonViewReceipt
        {
            DropId = drop.Id,
            DeviceId = "recipient1",
            ViewedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new MarkCharonDropViewedCommandHandler(context, notifier);
        await handler.Handle(new MarkCharonDropViewedCommand(drop.Id, "recipient2"), CancellationToken.None);

        (await context.CharonDrops.AnyAsync(d => d.Id == drop.Id)).Should().BeFalse();
        (await context.CharonViewReceipts.AnyAsync(r => r.DropId == drop.Id)).Should().BeFalse();
        await notifier.Received(1).NotifyCharonDropDeleted(list.Id, drop.Id);
    }

    [Fact]
    public async Task Handle_NoOtherMembers_BurnsDropOnFirstView()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv", senderDeviceId: "sender");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.GhostListMembers.Add(CreateMember(list.Id, "sender"));
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new MarkCharonDropViewedCommandHandler(context, notifier);
        await handler.Handle(new MarkCharonDropViewedCommand(drop.Id, "sender"), CancellationToken.None);

        (await context.CharonDrops.AnyAsync(d => d.Id == drop.Id)).Should().BeFalse();
        await notifier.Received(1).NotifyCharonDropDeleted(list.Id, drop.Id);
    }

    [Fact]
    public async Task Handle_AlreadyViewedByDevice_DoesNotDuplicateReceipt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv", senderDeviceId: "sender");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.GhostListMembers.AddRange(
            CreateMember(list.Id, "sender"),
            CreateMember(list.Id, "recipient1"),
            CreateMember(list.Id, "recipient2"));
        await context.SaveChangesAsync();

        var handler = new MarkCharonDropViewedCommandHandler(context, MockNotifier());
        await handler.Handle(new MarkCharonDropViewedCommand(drop.Id, "recipient1"), CancellationToken.None);
        await handler.Handle(new MarkCharonDropViewedCommand(drop.Id, "recipient1"), CancellationToken.None);

        context.CharonViewReceipts.Count(r => r.DropId == drop.Id && r.DeviceId == "recipient1").Should().Be(1);
    }
}
