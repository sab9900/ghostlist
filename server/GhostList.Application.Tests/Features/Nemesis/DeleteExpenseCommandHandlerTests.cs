using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.DeleteExpense;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class DeleteExpenseCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisExpenseDeleted(Arg.Any<Guid>(), Arg.Any<NemesisExpenseDeletedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IBlobStorage MockBlob()
    {
        var blob = Substitute.For<IBlobStorage>();
        blob.DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return blob;
    }

    private static async Task<NemesisExpense> SeedExpense(
        GhostList.Infrastructure.Persistence.ApplicationDbContext context,
        string? createdByUserId = "creator")
    {
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var expense = NemesisExpense.Create(list.Id, "enc", "iv", splitCount: 2, createdByDeviceId: "device1", createdByUserId: createdByUserId);
        context.NemesisExpenses.Add(expense);
        await context.SaveChangesAsync();

        return expense;
    }

    [Fact]
    public async Task Handle_CreatorDeletes_RemovesExpense()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);

        var handler = new DeleteExpenseCommandHandler(context, MockNotifier(), MockBlob());
        await handler.Handle(new DeleteExpenseCommand(expense.Id, "creator"), CancellationToken.None);

        context.NemesisExpenses.Find(expense.Id).Should().BeNull();
    }

    [Fact]
    public async Task Handle_CreatorDeletes_NotifiesExpenseDeleted()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);
        var notifier = MockNotifier();

        var handler = new DeleteExpenseCommandHandler(context, notifier, MockBlob());
        await handler.Handle(new DeleteExpenseCommand(expense.Id, "creator"), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisExpenseDeleted(expense.GhostListId, Arg.Is<NemesisExpenseDeletedNotification>(n =>
            n.ExpenseId == expense.Id && n.GhostListId == expense.GhostListId));
    }

    [Fact]
    public async Task Handle_WithReceipt_DeletesReceiptBlob()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);
        expense.AttachReceipt("enc_receipt_key", "nemesis-receipts/abc");
        await context.SaveChangesAsync();
        var blob = MockBlob();

        var handler = new DeleteExpenseCommandHandler(context, MockNotifier(), blob);
        await handler.Handle(new DeleteExpenseCommand(expense.Id, "creator"), CancellationToken.None);

        await blob.Received(1).DeleteAsync("nemesis-receipts/abc", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_NonCreator_ThrowsForbiddenAndKeepsExpense()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);

        var handler = new DeleteExpenseCommandHandler(context, MockNotifier(), MockBlob());
        var act = () => handler.Handle(new DeleteExpenseCommand(expense.Id, "someone_else"), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        context.NemesisExpenses.Find(expense.Id).Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_MissingUserId_ThrowsForbidden()
    {
        await using var context = DbContextFactory.Create();
        var expense = await SeedExpense(context);

        var handler = new DeleteExpenseCommandHandler(context, MockNotifier(), MockBlob());
        var act = () => handler.Handle(new DeleteExpenseCommand(expense.Id, null), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Handle_NonExistentExpense_ThrowsNotFound()
    {
        await using var context = DbContextFactory.Create();

        var handler = new DeleteExpenseCommandHandler(context, MockNotifier(), MockBlob());
        var act = () => handler.Handle(new DeleteExpenseCommand(Guid.NewGuid(), "creator"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
