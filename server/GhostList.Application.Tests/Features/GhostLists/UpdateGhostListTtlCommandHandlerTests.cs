using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListTtl;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostLists;

public class UpdateGhostListTtlCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyTtlUpdated(Arg.Any<Guid>(), Arg.Any<int>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ExistingList_UpdatesTtl()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create(DeleteAfterDuration.OneDay);
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new UpdateGhostListTtlCommandHandler(context, MockNotifier());
        await handler.Handle(new UpdateGhostListTtlCommand(list.Id, DeleteAfterDuration.OneWeek), CancellationToken.None);

        var updated = await context.GhostLists.FindAsync(list.Id);
        updated!.CompletedItemsTtl.Should().Be(DeleteAfterDuration.OneWeek);
    }

    [Fact]
    public async Task Handle_ExistingList_NotifiesTtlUpdated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new UpdateGhostListTtlCommandHandler(context, notifier);
        await handler.Handle(new UpdateGhostListTtlCommand(list.Id, DeleteAfterDuration.ThreeDays), CancellationToken.None);

        await notifier.Received(1).NotifyTtlUpdated(list.Id, (int)DeleteAfterDuration.ThreeDays);
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new UpdateGhostListTtlCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(
            new UpdateGhostListTtlCommand(Guid.NewGuid(), DeleteAfterDuration.OneDay),
            CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
