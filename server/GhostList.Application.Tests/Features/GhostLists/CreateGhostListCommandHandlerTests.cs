using FluentAssertions;
using GhostList.Application.Features.GhostLists.Commands.CreateGhostList;
using GhostList.Application.Tests.Helpers;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Tests.Features.GhostLists;

public class CreateGhostListCommandHandlerTests
{
    [Fact]
    public async Task Handle_CreatesListAndReturnsId()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateGhostListCommandHandler(context);

        var id = await handler.Handle(new CreateGhostListCommand(), CancellationToken.None);

        id.Should().NotBeEmpty();
        var list = await context.GhostLists.FirstOrDefaultAsync(l => l.Id == id);
        list.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_CalledTwice_CreatesTwoDistinctLists()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateGhostListCommandHandler(context);

        var id1 = await handler.Handle(new CreateGhostListCommand(), CancellationToken.None);
        var id2 = await handler.Handle(new CreateGhostListCommand(), CancellationToken.None);

        id1.Should().NotBe(id2);
        (await context.GhostLists.CountAsync()).Should().Be(2);
    }
}
