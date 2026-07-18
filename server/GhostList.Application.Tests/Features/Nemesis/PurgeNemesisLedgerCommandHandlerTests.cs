using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.PurgeNemesisLedger;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class PurgeNemesisLedgerCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisLedgerPurged(Arg.Any<Guid>(), Arg.Any<NemesisLedgerPurgedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_SoftDeletesAllExpensesAndSettlements()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator");
        context.NemesisExpenses.Add(expense);
        var settlement = NemesisSettlement.CreateConfirmedByReceiver(list.Id, "enc", "iv", "payer", "receiver");
        context.NemesisSettlements.Add(settlement);
        await context.SaveChangesAsync();

        var handler = new PurgeNemesisLedgerCommandHandler(context, MockNotifier());
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        context.NemesisExpenses.Find(expense.Id)!.DeletedAt.Should().NotBeNull();
        context.NemesisSettlements.Find(settlement.Id)!.DeletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_KeepsRowsInDatabase()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator");
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();

        var handler = new PurgeNemesisLedgerCommandHandler(context, MockNotifier());
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        context.NemesisExpenses.Find(expense.Id).Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_OnlyPurgesTargetList()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var otherList = Domain.Entities.GhostList.Create();
        context.GhostLists.AddRange(list, otherList);
        var keep = NemesisExpense.Create(otherList.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator");
        context.NemesisExpenses.Add(keep);
        context.NemesisExpenses.Add(NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator"));
        await context.SaveChangesAsync();

        var handler = new PurgeNemesisLedgerCommandHandler(context, MockNotifier());
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        context.NemesisExpenses.Find(keep.Id)!.DeletedAt.Should().BeNull();
    }

    [Fact]
    public async Task Handle_EmptyLedger_DoesNotNotify()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();
        var notifier = MockNotifier();

        var handler = new PurgeNemesisLedgerCommandHandler(context, notifier);
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        await notifier.DidNotReceive().NotifyNemesisLedgerPurged(Arg.Any<Guid>(), Arg.Any<NemesisLedgerPurgedNotification>());
    }

    [Fact]
    public async Task Handle_AlreadyPurged_DoesNotNotifyAgain()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator");
        expense.SoftDelete();
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();
        var notifier = MockNotifier();

        var handler = new PurgeNemesisLedgerCommandHandler(context, notifier);
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        await notifier.DidNotReceive().NotifyNemesisLedgerPurged(Arg.Any<Guid>(), Arg.Any<NemesisLedgerPurgedNotification>());
    }

    [Fact]
    public async Task Handle_WithData_NotifiesPurged()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        context.NemesisExpenses.Add(NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByUserId: "creator"));
        await context.SaveChangesAsync();
        var notifier = MockNotifier();

        var handler = new PurgeNemesisLedgerCommandHandler(context, notifier);
        await handler.Handle(new PurgeNemesisLedgerCommand(list.Id), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisLedgerPurged(list.Id, Arg.Is<NemesisLedgerPurgedNotification>(n => n.GhostListId == list.Id));
    }
}
