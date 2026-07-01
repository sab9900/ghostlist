using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.ConfirmSettlement;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class ConfirmSettlementCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementConfirmed(Arg.Any<Guid>(), Arg.Any<NemesisSettlementConfirmedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ValidSettlement_ConfirmsReceipt()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new ConfirmSettlementCommandHandler(context, MockNotifier());
        await handler.Handle(new ConfirmSettlementCommand(settlement.Id), CancellationToken.None);

        var updated = context.NemesisSettlements.Find(settlement.Id);
        updated!.IsConfirmedByReceiver.Should().BeTrue();
        updated.ConfirmedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_ValidSettlement_NotifiesConfirmation()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ConfirmSettlementCommandHandler(context, notifier);
        await handler.Handle(new ConfirmSettlementCommand(settlement.Id), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementConfirmed(list.Id, Arg.Is<NemesisSettlementConfirmedNotification>(n =>
            n.SettlementId == settlement.Id &&
            n.GhostListId == list.Id));
    }

    [Fact]
    public async Task Handle_NonExistentSettlement_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new ConfirmSettlementCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new ConfirmSettlementCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_AlreadyConfirmedSettlement_ThrowsInvalidOperationException()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv");
        settlement.ConfirmReceipt();
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new ConfirmSettlementCommandHandler(context, MockNotifier());
        var act = () => handler.Handle(new ConfirmSettlementCommand(settlement.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
