using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostLists.Commands.DeleteGhostList;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostLists;

public class DeleteGhostListCommandHandlerTests
{
    private static DeleteGhostListCommandHandler CreateHandler(IApplicationDbContext context)
        => new(context, Substitute.For<IGhostListNotifier>());

    [Fact]
    public async Task Handle_ExistingList_DeletesListAndCascadedEntities()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var item = GhostListItem.Create(list.Id, "payload", "iv");
        var msg = GhostChatMessage.Create(list.Id, "msg", "iv", "sender", "siv");
        context.GhostLists.Add(list);
        context.GhostListItems.Add(item);
        context.GhostChatMessages.Add(msg);
        await context.SaveChangesAsync();

        await CreateHandler(context).Handle(new DeleteGhostListCommand(list.Id), CancellationToken.None);

        (await context.GhostLists.AnyAsync(l => l.Id == list.Id)).Should().BeFalse();
        (await context.GhostListItems.AnyAsync(i => i.GhostListId == list.Id)).Should().BeFalse();
        (await context.GhostChatMessages.AnyAsync(m => m.GhostListId == list.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();

        var act = () => CreateHandler(context).Handle(new DeleteGhostListCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
