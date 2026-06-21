using FluentAssertions;
using GhostList.Application.Features.ListReminders.Queries.GetListReminders;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.ListReminders;

public class GetListRemindersQueryHandlerTests
{
    [Fact]
    public async Task Handle_ReturnsOnlyUnacknowledgedRemindersForDevice()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        var own = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(1));
        var acknowledged = ListReminder.Create(list.Id, "device1", DateTime.UtcNow.AddHours(2));
        acknowledged.MarkAcknowledged();
        var otherDevice = ListReminder.Create(list.Id, "device2", DateTime.UtcNow.AddHours(1));

        context.ListReminders.AddRange(own, acknowledged, otherDevice);
        await context.SaveChangesAsync();

        var handler = new GetListRemindersQueryHandler(context);
        var result = await handler.Handle(new GetListRemindersQuery(list.Id, "device1"), CancellationToken.None);

        result.Should().ContainSingle().Which.Id.Should().Be(own.Id);
    }
}
