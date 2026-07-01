using FluentAssertions;
using GhostList.Application.Features.Nemesis.Queries.GetEncryptedExpenses;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.Nemesis;

public class GetEncryptedExpensesQueryHandlerTests
{
    [Fact]
    public async Task Handle_ReturnsPendingExpensesForList()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        context.NemesisExpenses.Add(NemesisExpense.Create(list.Id, "enc1", "iv1", splitCount: 2));
        context.NemesisExpenses.Add(NemesisExpense.Create(list.Id, "enc2", "iv2", splitCount: 2));
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Expenses.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_ReturnsVerifiedArchivedExpensesForDebtCalc()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var pending = NemesisExpense.Create(list.Id, "enc1", "iv1", splitCount: 2);
        var selfExpense = NemesisExpense.Create(list.Id, "enc2", "iv2", splitCount: 0);
        context.NemesisExpenses.AddRange(pending, selfExpense);
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Expenses.Should().HaveCount(2);
        result.Expenses.Should().Contain(e => e.Status == VerificationStatus.Pending);
        result.Expenses.Should().Contain(e => e.Status == VerificationStatus.Verified);
    }

    [Fact]
    public async Task Handle_DoesNotReturnManuallyArchivedRejectedExpenses()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var pending = NemesisExpense.Create(list.Id, "enc1", "iv1", splitCount: 2);
        var rejected = NemesisExpense.Create(list.Id, "enc2", "iv2", splitCount: 2);
        rejected.Reject();
        rejected.Archive();
        context.NemesisExpenses.AddRange(pending, rejected);
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Expenses.Should().HaveCount(1);
        result.Expenses[0].EncryptedPayload.Should().Be("enc1");
    }

    [Fact]
    public async Task Handle_DoesNotReturnExpensesFromOtherLists()
    {
        await using var context = DbContextFactory.Create();
        var list1 = Domain.Entities.GhostList.Create();
        var list2 = Domain.Entities.GhostList.Create();
        context.GhostLists.AddRange(list1, list2);
        context.NemesisExpenses.Add(NemesisExpense.Create(list1.Id, "enc1", "iv1", splitCount: 2));
        context.NemesisExpenses.Add(NemesisExpense.Create(list2.Id, "enc2", "iv2", splitCount: 2));
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list1.Id), CancellationToken.None);

        result.Expenses.Should().HaveCount(1);
        result.Expenses[0].EncryptedPayload.Should().Be("enc1");
    }

    [Fact]
    public async Task Handle_ReturnsSettlementsForList()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        context.NemesisSettlements.Add(NemesisSettlement.Create(list.Id, "enc", "iv"));
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Settlements.Should().HaveCount(1);
    }

    [Fact]
    public async Task Handle_IncludesVerificationsOnExpenses()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2);
        expense.AddVerification("user1");
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Expenses[0].Verifications.Should().HaveCount(1);
        result.Expenses[0].Verifications[0].VerifiedByUserId.Should().Be("user1");
    }

    [Fact]
    public async Task Handle_EmptyList_ReturnsEmpty()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new GetEncryptedExpensesQueryHandler(context);
        var result = await handler.Handle(new GetEncryptedExpensesQuery(list.Id), CancellationToken.None);

        result.Expenses.Should().BeEmpty();
        result.Settlements.Should().BeEmpty();
    }
}
