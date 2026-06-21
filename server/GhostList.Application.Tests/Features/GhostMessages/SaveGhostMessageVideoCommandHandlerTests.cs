using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.GhostMessages.Commands.SaveGhostMessageVideo;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.GhostMessages;

public class SaveGhostMessageVideoCommandHandlerTests
{
    private static IBlobStorage MockBlob() => Substitute.For<IBlobStorage>();

    private static SaveGhostMessageVideoCommand ValidCommand(Guid messageId) => new(
        MessageId: messageId,
        EncryptedVideo: "enc_vid",
        VideoInitializationVector: "vid_iv");

    private static async Task<GhostChatMessage> SeedMessageAsync(
        GhostList.Infrastructure.Persistence.ApplicationDbContext context)
    {
        var list = GhostList.Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var message = GhostChatMessage.Create(list.Id, "enc_msg", "msg_iv", "enc_sender", "sender_iv");
        context.GhostChatMessages.Add(message);
        await context.SaveChangesAsync();

        return message;
    }

    [Fact]
    public async Task Handle_ValidCommand_SavesBlobWithIvAndContent()
    {
        await using var context = DbContextFactory.Create();
        var message = await SeedMessageAsync(context);
        var blob = MockBlob();

        var handler = new SaveGhostMessageVideoCommandHandler(context, blob);
        await handler.Handle(ValidCommand(message.Id), CancellationToken.None);

        await blob.Received(1).SaveAsync(
            Arg.Is<string>(k => k.Contains(message.Id.ToString())),
            Arg.Is<string>(v => v.Contains("vid_iv") && v.Contains("enc_vid")),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_MessageNotFound_ThrowsNotFoundException()
    {
        await using var context = DbContextFactory.Create();
        var handler = new SaveGhostMessageVideoCommandHandler(context, MockBlob());

        var act = () => handler.Handle(ValidCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
