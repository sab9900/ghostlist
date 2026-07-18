using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.UpdateExpenseSplit;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class UpdateExpenseSplitCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisExpenseUpdated(Arg.Any<Guid>(), Arg.Any<NemesisExpenseUpdatedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static async Task<NemesisExpense> SeedExpense(
        GhostList.Infrastructure.Persistence.ApplicationDbContext context,
        int splitCount = 3)
    {
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount, createdByUserId: "payer");
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();

        return expense;
    }

    private static async Task Verify(
        GhostList.Infrastructure.Persistence.ApplicationDbContext context,
        NemesisExpense expense,
        string userId)
    {
        expense.AddVerification(userId);
        context.NemesisVerifications.Add(expense.Verifications.First(v => v.VerifiedByUserId == userId));
        await context.SaveChangesAsync();
    }

    [Fact]
    public async Task Handle_UpdatesPayloadAndSplitCount()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);

        var handler = new UpdateExpenseSplitCommandHandler(context, MockNotifier());
        await handler.Handle(new UpdateExpenseSplitCommand(expense.Id, "enc2", "iv2", SplitCount: 2), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id)!;
        updated.EncryptedPayload.Should().Be("enc2");
        updated.PayloadInitializationVector.Should().Be("iv2");
        updated.SplitCount.Should().Be(2);
    }

    [Fact]
    public async Task Handle_WhenRemainingVerificationsMeetNewSplitCount_PromotesToVerified()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);
        await Verify(context, expense, "user1");
        await Verify(context, expense, "user2");

        var handler = new UpdateExpenseSplitCommandHandler(context, MockNotifier());
        await handler.Handle(new UpdateExpenseSplitCommand(expense.Id, "enc2", "iv2", SplitCount: 2), CancellationToken.None);

        context.NemesisExpenses.Find(expense.Id)!.Status.Should().Be(VerificationStatus.Verified);
    }

    [Fact]
    public async Task Handle_RemovesLeaverVerification()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);
        await Verify(context, expense, "user1");
        await Verify(context, expense, "leaver");

        var handler = new UpdateExpenseSplitCommandHandler(context, MockNotifier());
        await handler.Handle(new UpdateExpenseSplitCommand(expense.Id, "enc2", "iv2", SplitCount: 2, RemovedUserIds: ["leaver"]), CancellationToken.None);

        context.NemesisVerifications.Should().NotContain(v => v.VerifiedByUserId == "leaver");
        context.NemesisVerifications.Should().Contain(v => v.VerifiedByUserId == "user1");
    }

    [Fact]
    public async Task Handle_NotifiesExpenseUpdated()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);
        var notifier = MockNotifier();

        var handler = new UpdateExpenseSplitCommandHandler(context, notifier);
        await handler.Handle(new UpdateExpenseSplitCommand(expense.Id, "enc2", "iv2", SplitCount: 2), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisExpenseUpdated(expense.GhostListId, Arg.Is<NemesisExpenseUpdatedNotification>(n =>
            n.Id == expense.Id && n.EncryptedPayload == "enc2" && n.SplitCount == 2));
    }

    [Fact]
    public async Task Handle_OnVerifiedExpense_IsNoOp()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context, splitCount: 1);
        await Verify(context, expense, "user1");
        var notifier = MockNotifier();

        var handler = new UpdateExpenseSplitCommandHandler(context, notifier);
        await handler.Handle(new UpdateExpenseSplitCommand(expense.Id, "enc2", "iv2", SplitCount: 0), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id)!;
        updated.EncryptedPayload.Should().Be("enc");
        await notifier.DidNotReceive().NotifyNemesisExpenseUpdated(Arg.Any<Guid>(), Arg.Any<NemesisExpenseUpdatedNotification>());
    }

    [Fact]
    public async Task Handle_NonExistentExpense_ThrowsNotFound()
    {
        await using var context = DbContextFactory.Create();

        var handler = new UpdateExpenseSplitCommandHandler(context, MockNotifier());
        var act = () => handler.Handle(new UpdateExpenseSplitCommand(Guid.NewGuid(), "enc2", "iv2", SplitCount: 1), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
