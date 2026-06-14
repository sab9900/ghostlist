using FluentAssertions;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Application.Features.ListMembers.Commands.UpsertListMember;
using GhostList.Application.Tests.Helpers;
using GhostList.Domain.Entities;
using NSubstitute;

namespace GhostList.Application.Tests.Features.ListMembers;

public class UpsertListMemberCommandHandlerTests
{
    private static IGhostListNotifier MockNotifier()
    {
        var notifier = Substitute.For<IGhostListNotifier>();
        notifier.NotifyMemberJoined(Arg.Any<Guid>(), Arg.Any<string>()).Returns(Task.CompletedTask);
        return notifier;
    }

    private static GhostListMember CreateMember(Guid listId, string deviceId) => new()
    {
        Id = Guid.NewGuid(),
        GhostListId = listId,
        DeviceId = deviceId,
        EncryptedPayload = "payload",
        InitializationVector = "iv",
        UpdatedAt = DateTimeOffset.UtcNow
    };

    [Fact]
    public async Task Handle_NewMember_CreatesMemberAndNotifiesJoined()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new UpsertListMemberCommandHandler(context, notifier);
        await handler.Handle(new UpsertListMemberCommand(list.Id, "device1", "enc_payload", "iv"), CancellationToken.None);

        var member = context.GhostListMembers.SingleOrDefault(m => m.GhostListId == list.Id && m.DeviceId == "device1");
        member.Should().NotBeNull();
        member!.EncryptedPayload.Should().Be("enc_payload");

        await notifier.Received(1).NotifyMemberJoined(list.Id, "device1");
    }

    [Fact]
    public async Task Handle_ExistingMember_UpdatesPayloadAndDoesNotNotifyJoined()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        var member = CreateMember(list.Id, "device1");

        context.GhostLists.Add(list);
        context.GhostListMembers.Add(member);
        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new UpsertListMemberCommandHandler(context, notifier);
        await handler.Handle(new UpsertListMemberCommand(list.Id, "device1", "new_payload", "new_iv"), CancellationToken.None);

        var updated = await context.GhostListMembers.FindAsync(member.Id);
        updated!.EncryptedPayload.Should().Be("new_payload");
        updated.InitializationVector.Should().Be("new_iv");

        await notifier.DidNotReceive().NotifyMemberJoined(Arg.Any<Guid>(), Arg.Any<string>());
    }

    [Fact]
    public async Task Handle_ListFull_ThrowsListFullExceptionAndDoesNotNotify()
    {
        await using var context = DbContextFactory.Create();
        var list = Domain.Entities.GhostList.Create();
        context.GhostLists.Add(list);

        for (var i = 0; i < UpsertListMemberCommandHandler.MaxMembersPerList; i++)
        {
            context.GhostListMembers.Add(CreateMember(list.Id, $"device{i}"));
        }

        await context.SaveChangesAsync();

        var notifier = MockNotifier();
        var handler = new UpsertListMemberCommandHandler(context, notifier);
        var act = () => handler.Handle(new UpsertListMemberCommand(list.Id, "new-device", "enc_payload", "iv"), CancellationToken.None);

        await act.Should().ThrowAsync<ListFullException>();
        await notifier.DidNotReceive().NotifyMemberJoined(Arg.Any<Guid>(), Arg.Any<string>());
    }
}
