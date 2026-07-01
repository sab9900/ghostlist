using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Nemesis.Commands.CreateExpense;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Nemesis;

public class CreateExpenseCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyNemesisExpenseCreated(Arg.Any<Guid>(), Arg.Any<NemesisExpenseCreatedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(Arg.Any<Guid>(), Arg.Any<PushNotificationType>(), Arg.Any<string?>(), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return push;
    }

    [Fact]
    public async Task Handle_ValidRequest_CreatesExpense()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new CreateExpenseCommandHandler(context, MockNotifier(), MockPush());
        var expenseId = await handler.Handle(new CreateExpenseCommand(
            list.Id, "enc_payload", "iv", SplitCount: 2, CreatedByDeviceId: "device1", CreatedByUserId: "user1"), CancellationToken.None);

        var expense = context.NemesisExpenses.Find(expenseId);
        expense.Should().NotBeNull();
        expense!.GhostListId.Should().Be(list.Id);
        expense.EncryptedPayload.Should().Be("enc_payload");
        expense.Status.Should().Be(VerificationStatus.Pending);
    }

    [Fact]
    public async Task Handle_ZeroSplitCount_CreatesImmediatelyVerified()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new CreateExpenseCommandHandler(context, MockNotifier(), MockPush());
        var expenseId = await handler.Handle(new CreateExpenseCommand(
            list.Id, "enc_payload", "iv", SplitCount: 0), CancellationToken.None);

        var expense = context.NemesisExpenses.Find(expenseId);
        expense!.Status.Should().Be(VerificationStatus.Verified);
        expense.IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_ValidRequest_NotifiesExpenseCreated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new CreateExpenseCommandHandler(context, notifier, MockPush());
        await handler.Handle(new CreateExpenseCommand(list.Id, "enc_payload", "iv", SplitCount: 2), CancellationToken.None);

        await notifier.Received(1).NotifyNemesisExpenseCreated(list.Id, Arg.Is<NemesisExpenseCreatedNotification>(n =>
            n.GhostListId == list.Id &&
            n.EncryptedPayload == "enc_payload" &&
            n.SplitCount == 2 &&
            n.Status == VerificationStatus.Pending));
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateExpenseCommandHandler(context, MockNotifier(), MockPush());

        var act = () => handler.Handle(new CreateExpenseCommand(
            Guid.NewGuid(), "enc_payload", "iv", SplitCount: 2), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
