using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.ExpireSettlements;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class ExpireSettlementsCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementExpired(Arg.Any<Guid>(), Arg.Any<NemesisSettlementExpiredNotification>()).Returns(Task.CompletedTask);
        notifier.NotifyNemesisSettlementExpiring(Arg.Any<Guid>(), Arg.Any<NemesisSettlementExpiringNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    private static NemesisSettlement CreateAgedSettlement(Guid listId, double daysOld, string? payerUserId = null, string? receiverUserId = null)
    {
        var settlement = NemesisSettlement.Create(listId, "enc", "iv", payerUserId: payerUserId, receiverUserId: receiverUserId);
        typeof(NemesisSettlement)
            .GetProperty("CreatedAt", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public)!
            .SetValue(settlement, DateTime.UtcNow.AddDays(-daysOld));
        return settlement;
    }

    [Fact]
    public async Task Handle_ExpiredSettlement_SetsStatusToExpired()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = CreateAgedSettlement(list.Id, daysOld: 61);
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new ExpireSettlementsCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        var updated = context.NemesisSettlements.Find(settlement.Id);
        updated!.Status.Should().Be(SettlementStatus.Expired);
    }

    [Fact]
    public async Task Handle_ExpiredSettlement_NotifiesExpired()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = CreateAgedSettlement(list.Id, daysOld: 61);
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ExpireSettlementsCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementExpired(list.Id, Arg.Is<NemesisSettlementExpiredNotification>(n =>
            n.SettlementId == settlement.Id));
    }

    [Fact]
    public async Task Handle_FreshSettlement_IsNotExpired()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = CreateAgedSettlement(list.Id, daysOld: 5);
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new ExpireSettlementsCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        var updated = context.NemesisSettlements.Find(settlement.Id);
        updated!.Status.Should().Be(SettlementStatus.Pending);
    }

    [Fact]
    public async Task Handle_SettlementExpiringIn6To7Days_SendsWarning()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = CreateAgedSettlement(list.Id, daysOld: 53.5);
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ExpireSettlementsCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisSettlementExpiring(list.Id, Arg.Any<NemesisSettlementExpiringNotification>());
        var updated = context.NemesisSettlements.Find(settlement.Id);
        updated!.Status.Should().Be(SettlementStatus.Pending);
    }

    [Fact]
    public async Task Handle_AlreadyConfirmedSettlement_IsIgnored()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = CreateAgedSettlement(list.Id, daysOld: 61);
        settlement.ConfirmReceipt();
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new ExpireSettlementsCommandHandler(context, notifier, MockPush());
        await handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        await notifier.DidNotReceive().NotifyNemesisSettlementExpired(Arg.Any<Guid>(), Arg.Any<NemesisSettlementExpiredNotification>());
    }

    [Fact]
    public async Task Handle_NoSettlements_CompletesWithoutError()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new ExpireSettlementsCommandHandler(context, MockNotifier(), MockPush());
        var act = () => handler.Handle(new ExpireSettlementsCommand(), CancellationToken.None);

        await act.Should().NotThrowAsync();
    }
}
