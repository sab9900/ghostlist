using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.SubmitSettlement;
using GhostList.Application.Tests.Helpers;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class SubmitSettlementCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementCreated(Arg.Any<Guid>(), Arg.Any<NemesisSettlementCreatedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return push;
    }

    [Fact]
    public async Task Handle_ValidRequest_CreatesSettlement()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new SubmitSettlementCommandHandler(context, MockNotifier(), MockPush());
        var settlementId = await handler.Handle(new SubmitSettlementCommand(
            list.Id, "enc_payload", "iv", "device1", "user1"), CancellationToken.None);

        var settlement = context.NemesisSettlements.Find(settlementId);
        settlement.Should().NotBeNull();
        settlement!.GhostListId.Should().Be(list.Id);
        settlement.IsPaidByPayer.Should().BeTrue();
        settlement.IsConfirmedByReceiver.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_ValidRequest_NotifiesSettlementCreated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new SubmitSettlementCommandHandler(context, notifier, MockPush());
        await handler.Handle(new SubmitSettlementCommand(list.Id, "enc_payload", "iv"), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementCreated(list.Id, Arg.Is<NemesisSettlementCreatedNotification>(n =>
            n.GhostListId == list.Id &&
            n.IsPaidByPayer == true &&
            n.IsConfirmedByReceiver == false));
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new SubmitSettlementCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new SubmitSettlementCommand(
            Guid.NewGuid(), "enc_payload", "iv"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
