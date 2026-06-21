using FluentAssertions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.ListReminders.Commands.TriggerDueListReminders;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.Extensions.Logging;
using NSubstitute;

namespace GhostList.Application.Tests.Features.ListReminders;

public class TriggerDueListRemindersCommandHandlerTests
{
    private static IPushNotificationService MockPush()
    {
        var push = Substitute.For<IPushNotificationService>();
        push.SendNotificationAsync(
            Arg.Any<Guid>(),
            Arg.Any<PushNotificationType>(),
            Arg.Any<string?>(),
            Arg.Any<CancellationToken>(),
            Arg.Any<IReadOnlyCollection<string>?>()).Returns(Task.CompletedTask);
        return push;
    }

    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyListReminderFired(Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<DateTime>(), Arg.Any<string>())
            .Returns(Task.CompletedTask);
        return notifier;
    }

    private static ILogger<TriggerDueListRemindersCommandHandler> MockLogger() =>
        Substitute.For<ILogger<TriggerDueListRemindersCommandHandler>>();

    [Fact]
    public async Task Handle_DueReminder_SendsPushAndNotifiesAndMarksSent()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddMinutes(-1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var push = MockPush();
        var notifier = MockNotifier();
        var handler = new TriggerDueListRemindersCommandHandler(context, push, notifier, MockLogger());

        var fired = await handler.Handle(new TriggerDueListRemindersCommand(), CancellationToken.None);

        fired.Should().Be(1);
        await push.Received(1).SendNotificationAsync(
            list.Id, PushNotificationType.ListReminder, null, Arg.Any<CancellationToken>(),
            Arg.Is<IReadOnlyCollection<string>>(d => d.Contains("device1")));
        await notifier.Received(1).NotifyListReminderFired(list.Id, reminder.Id, reminder.RemindAt, "device1");
        context.ListReminders.Find(reminder.Id)!.IsSent.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_NoDueReminders_ReturnsZero()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new TriggerDueListRemindersCommandHandler(context, MockPush(), MockNotifier(), MockLogger());
        var fired = await handler.Handle(new TriggerDueListRemindersCommand(), CancellationToken.None);

        fired.Should().Be(0);
    }

    [Fact]
    public async Task Handle_AlreadySentReminder_IsNotFiredAgain()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddMinutes(-5));
        reminder.MarkSent();
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new TriggerDueListRemindersCommandHandler(context, MockPush(), MockNotifier(), MockLogger());
        var fired = await handler.Handle(new TriggerDueListRemindersCommand(), CancellationToken.None);

        fired.Should().Be(0);
    }
}
