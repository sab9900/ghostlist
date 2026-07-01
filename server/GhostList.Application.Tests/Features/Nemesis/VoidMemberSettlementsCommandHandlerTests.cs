using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.VoidMemberSettlements;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class VoidMemberSettlementsCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisSettlementVoided(Arg.Any<Guid>(), Arg.Any<NemesisSettlementVoidedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>(), Arg.Any<IReadOnlyCollection<string>?>(), Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    [Fact]
    public async Task Handle_VoidsAllPendingSettlementsForUser()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var asPayerSettlement = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1", receiverUserId: "user2");
        var asReceiverSettlement = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user2", receiverUserId: "user1");
        context.NemesisSettlements.AddRange(asPayerSettlement, asReceiverSettlement);
        await context.SaveChangesAsync();

        var handler = new VoidMemberSettlementsCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new VoidMemberSettlementsCommand(list.Id, "user1"), CancellationToken.None);

        context.NemesisSettlements.Should().AllSatisfy(s => s.Status.Should().Be(SettlementStatus.Voided));
    }

    [Fact]
    public async Task Handle_DoesNotVoidSettlementsFromOtherUsers()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var unrelated = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user2", receiverUserId: "user3");
        var target = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1", receiverUserId: "user2");
        context.NemesisSettlements.AddRange(unrelated, target);
        await context.SaveChangesAsync();

        var handler = new VoidMemberSettlementsCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new VoidMemberSettlementsCommand(list.Id, "user1"), CancellationToken.None);

        var updatedUnrelated = context.NemesisSettlements.Find(unrelated.Id);
        updatedUnrelated!.Status.Should().Be(SettlementStatus.Pending);
    }

    [Fact]
    public async Task Handle_DoesNotVoidAlreadyResolvedSettlements()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var confirmed = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1", receiverUserId: "user2");
        confirmed.ConfirmReceipt();
        context.NemesisSettlements.Add(confirmed);
        await context.SaveChangesAsync();

        var handler = new VoidMemberSettlementsCommandHandler(context, MockNotifier(), MockPush());
        await handler.Handle(new VoidMemberSettlementsCommand(list.Id, "user1"), CancellationToken.None);

        var updated = context.NemesisSettlements.Find(confirmed.Id);
        updated!.Status.Should().Be(SettlementStatus.Confirmed);
    }

    [Fact]
    public async Task Handle_NotifiesForEachVoidedSettlement()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var s1 = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1");
        var s2 = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1");
        context.NemesisSettlements.AddRange(s1, s2);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new VoidMemberSettlementsCommandHandler(context, notifier, MockPush());
        await handler.Handle(new VoidMemberSettlementsCommand(list.Id, "user1"), CancellationToken.None);

        await notifier.Received(2).NotifyNemesisSettlementVoided(list.Id, Arg.Any<NemesisSettlementVoidedNotification>());
    }

    [Fact]
    public async Task Handle_NullUserId_DoesNothing()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var settlement = NemesisSettlement.Create(list.Id, "enc", "iv", payerUserId: "user1");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new VoidMemberSettlementsCommandHandler(context, notifier, MockPush());
        await handler.Handle(new VoidMemberSettlementsCommand(list.Id, null), CancellationToken.None);

        await notifier.DidNotReceive().NotifyNemesisSettlementVoided(Arg.Any<Guid>(), Arg.Any<NemesisSettlementVoidedNotification>());
    }
}
