using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.Charon.Commands.DeleteCharonDrop;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Charon;

public class DeleteCharonDropCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyCharonDropDeleted(Arg.Any<Guid>(), Arg.Any<Guid>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ExistingDrop_DeletesDropAndReceipts()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv", senderDeviceId: "sender");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.CharonViewReceipts.Add(new CharonViewReceipt
        {
            DropId = drop.Id,
            DeviceId = "recipient1",
            ViewedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new DeleteCharonDropCommandHandler(context, MockNotifier());
        await handler.Handle(new DeleteCharonDropCommand(drop.Id), CancellationToken.None);

        (await context.CharonDrops.AnyAsync(d => d.Id == drop.Id)).Should().BeFalse();
        (await context.CharonViewReceipts.AnyAsync(r => r.DropId == drop.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Handle_ExistingDrop_NotifiesDropDeleted()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new DeleteCharonDropCommandHandler(context, notifier);
        await handler.Handle(new DeleteCharonDropCommand(drop.Id), CancellationToken.None);

        await notifier.Received(1).NotifyCharonDropDeleted(list.Id, drop.Id);
    }

    [Fact]
    public async Task Handle_NonExistentDrop_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new DeleteCharonDropCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new DeleteCharonDropCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
