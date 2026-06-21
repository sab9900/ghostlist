using FluentAssertions;
using GhostList.Application.Features.ListReminders.Commands.CreateListReminder;
using GhostList.Application.Tests.Helpers;

namespace GhostList.Application.Tests.Features.ListReminders;

public class CreateListReminderCommandHandlerTests
{
    [Fact]
    public async Task Handle_ValidRequest_CreatesReminder()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var remindAt = DateTime.UtcNow.AddHours(1);
        var handler = new CreateListReminderCommandHandler(context);
        var id = await handler.Handle(new CreateListReminderCommand(list.Id, "device1", remindAt), CancellationToken.None);

        var reminder = context.ListReminders.Find(id);
        reminder.Should().NotBeNull();
        reminder!.GhostListId.Should().Be(list.Id);
        reminder.DeviceId.Should().Be("device1");
        reminder.IsSent.Should().BeFalse();
        reminder.IsAcknowledged.Should().BeFalse();
    }
}
