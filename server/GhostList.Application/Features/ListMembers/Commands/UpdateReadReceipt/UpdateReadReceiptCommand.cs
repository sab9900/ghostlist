using GhostList.Application.Common.Interfaces;
using GhostList.Application.Common.Notifications;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Commands.UpdateReadReceipt;

public record UpdateReadReceiptCommand(
    Guid ListId,
    string DeviceId,
    DateTimeOffset? LastReadMessageAt = null,
    DateTimeOffset? LastReadItemAt = null) : IRequest;

public class UpdateReadReceiptCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<UpdateReadReceiptCommand>
{
    public async Task Handle(UpdateReadReceiptCommand request, CancellationToken cancellationToken)
    {
        var member = await context.GhostListMembers
            .FirstOrDefaultAsync(m => m.GhostListId == request.ListId && m.DeviceId == request.DeviceId, cancellationToken);

        if (member is null)
            return;

        var messageReadAdvanced = false;

        if (request.LastReadMessageAt is { } readMsgAt &&
            (member.LastReadMessageAt is null || readMsgAt > member.LastReadMessageAt))
        {
            member.LastReadMessageAt = readMsgAt;
            messageReadAdvanced = true;
        }

        if (request.LastReadItemAt is { } readItemAt &&
            (member.LastReadItemAt is null || readItemAt > member.LastReadItemAt))
        {
            member.LastReadItemAt = readItemAt;
        }

        await context.SaveChangesAsync(cancellationToken);

        if (messageReadAdvanced)
        {
            await notifier.NotifyReadReceiptUpdated(
                request.ListId,
                new ReadReceiptUpdatedNotification(request.ListId, request.DeviceId, member.LastReadMessageAt));
        }
    }
}
