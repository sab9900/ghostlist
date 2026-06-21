using FluentAssertions;
using GhostList.Application.Features.ListReminders.Commands.AcknowledgeListReminder;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.ListReminders;

public class AcknowledgeListReminderCommandHandlerTests
{
    [Fact]
    public async Task Handle_OwningDevice_MarksAcknowledged()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new AcknowledgeListReminderCommandHandler(context);
        await handler.Handle(new AcknowledgeListReminderCommand(reminder.Id, "device1"), CancellationToken.None);

        context.ListReminders.Find(reminder.Id)!.IsAcknowledged.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WrongDevice_DoesNotThrowAndLeavesUnacknowledged()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new AcknowledgeListReminderCommandHandler(context);
        await handler.Handle(new AcknowledgeListReminderCommand(reminder.Id, "device2"), CancellationToken.None);

        context.ListReminders.Find(reminder.Id)!.IsAcknowledged.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_NonExistentReminder_DoesNotThrow()
    {
        await using var context = DbContextFactory.Create();
        var handler = new AcknowledgeListReminderCommandHandler(context);

        var act = () => handler.Handle(new AcknowledgeListReminderCommand(Guid.NewGuid(), "device1"), CancellationToken.None);

        await act.Should().NotThrowAsync();
    }
}
