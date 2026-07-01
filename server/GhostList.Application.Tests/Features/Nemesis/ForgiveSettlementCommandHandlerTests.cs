using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.ForgiveSettlement;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class ForgiveSettlementCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementForgiven(Arg.Any<Guid>(), Arg.Any<NemesisSettlementForgivenNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    [Fact]
    public async Task Handle_ValidSettlement_SetsStatusToForgiven()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new ForgiveSettlementCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new ForgiveSettlementCommand(settlement.Id), CancellationToken.None);

        var updated = context.NemesisSettlements.Find(settlement.Id);
        updated!.Status.Should().Be(SettlementStatus.Forgiven);
        updated.ResolvedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_ValidSettlement_NotifiesForgiven()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ForgiveSettlementCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ForgiveSettlementCommand(settlement.Id), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementForgiven(list.Id, Arg.Is<NemesisSettlementForgivenNotification>(n =>
            n.SettlementId == settlement.Id &&
            n.GhostListId == list.Id));
    }

    [Fact]
    public async Task Handle_NonExistentSettlement_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new ForgiveSettlementCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new ForgiveSettlementCommand(Guid.NewGuid()), CancellationToken.None);

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

        var handler = new ForgiveSettlementCommandHandler(context, MockNotifier(), MockPush());
        var act = () => handler.Handle(new ForgiveSettlementCommand(settlement.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
