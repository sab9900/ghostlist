using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.ConfirmReceivedSettlement;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class ConfirmReceivedSettlementCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementCreated(Arg.Any<Guid>(), Arg.Any<NemesisSettlementCreatedNotification>()).Returns(Task.CompletedTask);
        notifier.NotifyNemesisSettlementConfirmed(Arg.Any<Guid>(), Arg.Any<NemesisSettlementConfirmedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    [Fact]
    public async Task Handle_ValidRequest_CreatesConfirmedSettlement()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new ConfirmReceivedSettlementCommandHandler(context, MockNotifier(), MockPush());
        var settlementId = await handler.Handle(new ConfirmReceivedSettlementCommand(
            list.Id, "enc_payload", "iv", "device1", "receiver1", "payer1"), CancellationToken.None);

        var settlement = context.NemesisSettlements.Find(settlementId);
        settlement.Should().NotBeNull();
        settlement!.GhostListId.Should().Be(list.Id);
        settlement.Status.Should().Be(SettlementStatus.Confirmed);
        settlement.IsConfirmedByReceiver.Should().BeTrue();
        settlement.IsPaidByPayer.Should().BeFalse();
        settlement.ReceiverUserId.Should().Be("receiver1");
        settlement.PayerUserId.Should().Be("payer1");
    }

    [Fact]
    public async Task Handle_ValidRequest_NotifiesCreatedAsAlreadyConfirmed()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ConfirmReceivedSettlementCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ConfirmReceivedSettlementCommand(
            list.Id, "enc_payload", "iv", "device1", "receiver1", "payer1"), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementCreated(list.Id, Arg.Is<NemesisSettlementCreatedNotification>(n =>
            n.GhostListId == list.Id &&
            n.IsConfirmedByReceiver == true &&
            n.IsPaidByPayer == false));
    }

    [Fact]
    public async Task Handle_WithPayerUserId_PushesToPayer()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var push = MockPush();
        var handler = new ConfirmReceivedSettlementCommandHandler(context, MockNotifier(), push);
        await handler.Handle(new ConfirmReceivedSettlementCommand(
            list.Id, "enc_payload", "iv", "device1", "receiver1", "payer1"), CancellationToken.None);

        await push.Received(1).SendNotificationAsync(
            list.Id,
            PushNotificationType.NemesisSettlementUpdate,
            "device1",
            Arg.Any<CancellationToken>(),
            Arg.Any<IReadOnlyCollection<string>?>(),
            Arg.Is<IReadOnlyCollection<string>?>(t => t != null && t.Contains("payer1")));
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new ConfirmReceivedSettlementCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new ConfirmReceivedSettlementCommand(
            Guid.NewGuid(), "enc_payload", "iv"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
