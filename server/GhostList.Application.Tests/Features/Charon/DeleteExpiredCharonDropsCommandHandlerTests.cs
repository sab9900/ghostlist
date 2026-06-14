using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.Charon.Commands.DeleteExpiredCharonDrops;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Charon;

public class DeleteExpiredCharonDropsCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyCharonDropDeleted(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_RemovesOnlyExpiredDropsAndNotifies()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var freshDrop = CharonDrop.Create(list.Id, "enc_fresh", "civ", "meta", "miv");
        var staleDrop = CharonDrop.Create(list.Id, "enc_stale", "civ", "meta", "miv");

        context.GhostLists.Add(list);
        context.CharonDrops.AddRange(freshDrop, staleDrop);
        context.CharonViewReceipts.Add(new CharonViewReceipt
        {
            DropId = staleDrop.Id,
            DeviceId = "device1",
            ViewedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        // Push the stale drop's CreatedAt outside the retention window.
        context.Entry(staleDrop).Property(nameof(CharonDrop.CreatedAt)).CurrentValue =
            DateTime.UtcNow - TimeSpan.FromDays(8);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new DeleteExpiredCharonDropsCommandHandler(context, notifier);
        var count = await handler.Handle(new DeleteExpiredCharonDropsCommand(), CancellationToken.None);

        count.Should().Be(1);
        (await context.CharonDrops.AnyAsync(d => d.Id == staleDrop.Id)).Should().BeFalse();
        (await context.CharonDrops.AnyAsync(d => d.Id == freshDrop.Id)).Should().BeTrue();
        (await context.CharonViewReceipts.AnyAsync(r => r.DropId == staleDrop.Id)).Should().BeFalse();
        await notifier.Received(1).NotifyCharonDropDeleted(list.Id, staleDrop.Id);
    }

    [Fact]
    public async Task Handle_NoExpiredDrops_ReturnsZero()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new DeleteExpiredCharonDropsCommandHandler(context, notifier);
        var count = await handler.Handle(new DeleteExpiredCharonDropsCommand(), CancellationToken.None);

        count.Should().Be(0);
        await notifier.DidNotReceive().NotifyCharonDropDeleted(Arg.Any<Guid>(), Arg.Any<Guid>());
    }
}
