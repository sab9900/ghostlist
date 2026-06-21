using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.ListReminders.Commands.DeleteListReminder;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.ListReminders;

public class DeleteListReminderCommandHandlerTests
{
    [Fact]
    public async Task Handle_OwningDevice_DeletesReminder()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new DeleteListReminderCommandHandler(context);
        await handler.Handle(new DeleteListReminderCommand(reminder.Id, "device1"), CancellationToken.None);

        context.ListReminders.Find(reminder.Id).Should().BeNull();
    }

    [Fact]
    public async Task Handle_OtherDevice_ThrowsForbiddenException()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        var reminder = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        context.ListReminders.Add(reminder);
        await context.SaveChangesAsync();

        var handler = new DeleteListReminderCommandHandler(context);
        var act = () => handler.Handle(new DeleteListReminderCommand(reminder.Id, "device2"), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Handle_NonExistentReminder_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new DeleteListReminderCommandHandler(context);

        var act = () => handler.Handle(new DeleteListReminderCommand(Guid.NewGuid(), "device1"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
