using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostLists.Commands.UpdateGhostListWhisperLifetime;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostLists;

public class UpdateGhostListWhisperLifetimeCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyWhisperLifetimeUpdated(Arg.Any<Guid>(), Arg.Any<int>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ExistingList_UpdatesWhisperLifetime()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new UpdateGhostListWhisperLifetimeCommandHandler(context, MockNotifier());
        await handler.Handle(new UpdateGhostListWhisperLifetimeCommand(list.Id, WhisperLifetime.EightSeconds), CancellationToken.None);

        var updated = await context.GhostLists.FindAsync(list.Id);
        updated!.WhisperLifetimeSeconds.Should().Be(WhisperLifetime.EightSeconds);
    }

    [Fact]
    public async Task Handle_ExistingList_NotifiesWhisperLifetimeUpdated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new UpdateGhostListWhisperLifetimeCommandHandler(context, notifier);
        await handler.Handle(new UpdateGhostListWhisperLifetimeCommand(list.Id, WhisperLifetime.TwentySeconds), CancellationToken.None);

        await notifier.Received(1).NotifyWhisperLifetimeUpdated(list.Id, (int)WhisperLifetime.TwentySeconds);
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new UpdateGhostListWhisperLifetimeCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(
            new UpdateGhostListWhisperLifetimeCommand(Guid.NewGuid(), WhisperLifetime.FiveSeconds),
            CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
