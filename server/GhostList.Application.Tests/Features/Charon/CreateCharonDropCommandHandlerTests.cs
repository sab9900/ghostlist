using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Application.Features.Charon.Commands.CreateCharonDrop;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace GhostList.Application.Tests.Features.Charon;

public class CreateCharonDropCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyCharonDropCreated(Arg.Any<Guid>(), Arg.Any<CharonDropCreatedNotification>()).Returns(Task.CompletedTask);
        return notifier;
    }

    [Fact]
    public async Task Handle_ValidRequest_CreatesDrop()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var handler = new CreateCharonDropCommandHandler(context, MockNotifier());
        var dropId = await handler.Handle(new CreateCharonDropCommand(
            list.Id, "enc_content", "civ", "enc_meta", "miv", "device1", "user1"), CancellationToken.None);

        var drop = await context.CharonDrops.FirstOrDefaultAsync(d => d.Id == dropId);
        drop.Should().NotBeNull();
        drop!.GhostListId.Should().Be(list.Id);
        drop.EncryptedContent.Should().Be("enc_content");
        drop.EncryptedMetadata.Should().Be("enc_meta");
        drop.SenderDeviceId.Should().Be("device1");
        drop.SenderUserId.Should().Be("user1");
    }

    [Fact]
    public async Task Handle_ValidRequest_NotifiesDropCreated()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new CreateCharonDropCommandHandler(context, notifier);
        await handler.Handle(new CreateCharonDropCommand(
            list.Id, "enc_content", "civ", "enc_meta", "miv"), CancellationToken.None);

        await notifier.Received(1).NotifyCharonDropCreated(list.Id, Arg.Is<CharonDropCreatedNotification>(n =>
            n.GhostListId == list.Id &&
            n.EncryptedContent == "enc_content" &&
            n.EncryptedMetadata == "enc_meta"));
    }

    [Fact]
    public async Task Handle_NonExistentList_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new CreateCharonDropCommandHandler(context, MockNotifier());

        var act = () => handler.Handle(new CreateCharonDropCommand(
            Guid.NewGuid(), "enc_content", "civ", "enc_meta", "miv"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_TooManyPendingDrops_ThrowsInvalidOperationException()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        for (var i = 0; i < 50; i++)
        {
            context.CharonDrops.Add(CharonDrop.Create(list.Id, $"enc_{i}", "civ", "enc_meta", "miv"));
        }

        await context.SaveChangesAsync();

        var handler = new CreateCharonDropCommandHandler(context, MockNotifier());
        var act = () => handler.Handle(new CreateCharonDropCommand(
            list.Id, "enc_content", "civ", "enc_meta", "miv"), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
