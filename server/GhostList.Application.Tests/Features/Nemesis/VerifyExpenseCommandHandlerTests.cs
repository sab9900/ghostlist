using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.VerifyExpense;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class VerifyExpenseCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisExpenseVerified(Arg.Any<Guid>(), Arg.Any<NemesisExpenseVerifiedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static async Task<(Domain.Entities.GhostList list, NemesisExpense expense)> SetupListAndExpense(
        GhostList.Infrastructure.Persistence.ApplicationDbContext context,
        int splitCount = 2)
    {
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount);
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();

        return (list, expense);
    }

    [Fact]
    public async Task Handle_ValidVerification_AddsVerification()
    {
        await using var context = DbContextFactory.Create();
        var (_, expense) = await SetupListAndExpense(context, splitCount: 2);

        var handler = new VerifyExpenseCommandHandler(context, MockNotifier());
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id);
        updated!.Verifications.Should().HaveCount(1);
        updated.Verifications[0].VerifiedByUserId.Should().Be("user1");
    }

    [Fact]
    public async Task Handle_LastVerification_PromotesToVerifiedAndArchives()
    {
        await using var context = DbContextFactory.Create();
        var (_, expense) = await SetupListAndExpense(context, splitCount: 1);

        var handler = new VerifyExpenseCommandHandler(context, MockNotifier());
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id);
        updated!.Status.Should().Be(VerificationStatus.Verified);
        updated.IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_PartialVerification_RemainsPending()
    {
        await using var context = DbContextFactory.Create();
        var (_, expense) = await SetupListAndExpense(context, splitCount: 2);

        var handler = new VerifyExpenseCommandHandler(context, MockNotifier());
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id);
        updated!.Status.Should().Be(VerificationStatus.Pending);
    }

    [Fact]
    public async Task Handle_ValidVerification_NotifiesExpenseVerified()
    {
        await using var context = DbContextFactory.Create();
        var (list, expense) = await SetupListAndExpense(context);

        var notifier = MockNotifier();
        var handler = new VerifyExpenseCommandHandler(context, notifier);
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisExpenseVerified(list.Id, Arg.Is<NemesisExpenseVerifiedNotification>(n =>
            n.ExpenseId == expense.Id &&
            n.VerifiedByUserId == "user1"));
    }

    [Fact]
    public async Task Handle_DuplicateVerification_IsIdempotent()
    {
        await using var context = DbContextFactory.Create();
        var (_, expense) = await SetupListAndExpense(context, splitCount: 2);

        var handler = new VerifyExpenseCommandHandler(context, MockNotifier());
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);
        await handler.Handle(new VerifyExpenseCommand(expense.Id, "user1"), CancellationToken.None);

        var updated = context.NemesisExpenses.Find(expense.Id);
        updated!.Verifications.Should().HaveCount(1);
    }

    [Fact]
    public async Task Handle_NonExistentExpense_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new VerifyExpenseCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new VerifyExpenseCommand(Guid.NewGuid(), "user1"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
