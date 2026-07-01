using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.Nemesis.Commands.UpdateNemesisSettings;
using GhostList.Application.Tests.Helpers;

namespace GhostList.Application.Tests.Features.Nemesis;

public class UpdateNemesisSettingsCommandHandlerTests
{
    [Fact]
    public async Task Handle_ValidCommand_UpdatesExpiryDays()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new UpdateNemesisSettingsCommandHandler(context);
        await handler.Handle(new UpdateNemesisSettingsCommand(list.Id, 90, 14), CancellationToken.None);

        var updated = context.GhostLists.Find(list.Id);
        updated!.NemesisSettlementExpiryDays.Should().Be(90);
    }

    [Fact]
    public async Task Handle_ValidCommand_UpdatesHideAfterDays()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new UpdateNemesisSettingsCommandHandler(context);
        await handler.Handle(new UpdateNemesisSettingsCommand(list.Id, 90, 14), CancellationToken.None);

        var updated = context.GhostLists.Find(list.Id);
        updated!.NemesisSettlementHideAfterDays.Should().Be(14);
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new UpdateNemesisSettingsCommandHandler(context);

        var act = () => handler.Handle(new UpdateNemesisSettingsCommand(Guid.NewGuid(), 60, 30), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
