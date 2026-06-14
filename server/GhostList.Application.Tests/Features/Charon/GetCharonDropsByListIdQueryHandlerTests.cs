using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Features.Charon.Queries.GetCharonDropsByListId;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;

namespace GhostList.Application.Tests.Features.Charon;

public class GetCharonDropsByListIdQueryHandlerTests
{
    [Fact]
    public async Task Handle_ReturnsOnlyDropsNotYetViewedByDevice()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var seenDrop = CharonDrop.Create(list.Id, "enc_seen", "civ", "meta", "miv");
        var unseenDrop = CharonDrop.Create(list.Id, "enc_unseen", "civ", "meta", "miv");

        context.GhostLists.Add(list);
        context.CharonDrops.AddRange(seenDrop, unseenDrop);
        context.CharonViewReceipts.Add(new CharonViewReceipt
        {
            DropId = seenDrop.Id,
            DeviceId = "device1",
            ViewedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new GetCharonDropsByListIdQueryHandler(context);
        var result = await handler.Handle(new GetCharonDropsByListIdQuery(list.Id, "device1"), CancellationToken.None);

        result.Should().ContainSingle();
        result[0].Id.Should().Be(unseenDrop.Id);
        result[0].EncryptedContent.Should().Be("enc_unseen");
    }

    [Fact]
    public async Task Handle_DifferentDevice_SeesDropOthersAlreadyViewed()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var drop = CharonDrop.Create(list.Id, "enc", "civ", "meta", "miv");

        context.GhostLists.Add(list);
        context.CharonDrops.Add(drop);
        context.CharonViewReceipts.Add(new CharonViewReceipt
        {
            DropId = drop.Id,
            DeviceId = "device1",
            ViewedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new GetCharonDropsByListIdQueryHandler(context);
        var result = await handler.Handle(new GetCharonDropsByListIdQuery(list.Id, "device2"), CancellationToken.None);

        result.Should().ContainSingle();
        result[0].Id.Should().Be(drop.Id);
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new GetCharonDropsByListIdQueryHandler(context);

        var act = () => handler.Handle(new GetCharonDropsByListIdQuery(Guid.NewGuid(), "device1"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
