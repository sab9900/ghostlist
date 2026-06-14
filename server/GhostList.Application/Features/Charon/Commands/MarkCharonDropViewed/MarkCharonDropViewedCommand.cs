using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.MarkCharonDropViewed;

/// <summary>
/// Records that <paramref name="DeviceId"/> has viewed (decrypted) a Charon
/// drop once. Once every other member of the list (i.e. every
/// <see cref="GhostListMember"/> whose device id differs from the drop's
/// <see cref="CharonDrop.SenderDeviceId"/>) has a view receipt, the drop and
/// all its receipts are deleted ("burned") and <c>CharonDropDeleted</c> is
/// broadcast.
/// </summary>
public record MarkCharonDropViewedCommand(Guid DropId, string DeviceId) : IRequest;

public class MarkCharonDropViewedCommandValidator : AbstractValidator<MarkCharonDropViewedCommand>
{
    public MarkCharonDropViewedCommandValidator()
    {
        RuleFor(x => x.DropId).NotEmpty();
        RuleFor(x => x.DeviceId).NotEmpty().MaximumLength(64);
    }
}

public class MarkCharonDropViewedCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<MarkCharonDropViewedCommand>
{
    public async Task Handle(MarkCharonDropViewedCommand request, CancellationToken cancellationToken)
    {
        var drop = await context.CharonDrops
            .FirstOrDefaultAsync(d => d.Id == request.DropId, cancellationToken)
            ?? throw new NotFoundException(nameof(CharonDrop), request.DropId);

        var alreadyViewed = await context.CharonViewReceipts
            .AnyAsync(r => r.DropId == drop.Id && r.DeviceId == request.DeviceId, cancellationToken);

        if (!alreadyViewed)
        {
            context.CharonViewReceipts.Add(new CharonViewReceipt
            {
                DropId = drop.Id,
                DeviceId = request.DeviceId,
                ViewedAt = DateTimeOffset.UtcNow,
            });

            await context.SaveChangesAsync(cancellationToken);
        }

        var recipientDeviceIds = await context.GhostListMembers
            .Where(m => m.GhostListId == drop.GhostListId && m.DeviceId != drop.SenderDeviceId)
            .Select(m => m.DeviceId)
            .ToListAsync(cancellationToken);

        bool fullyViewed;

        if (recipientDeviceIds.Count == 0)
        {
            // No other members to wait for - the drop is consumed by its first viewer.
            fullyViewed = true;
        }
        else
        {
            var viewedDeviceIds = await context.CharonViewReceipts
                .Where(r => r.DropId == drop.Id)
                .Select(r => r.DeviceId)
                .ToListAsync(cancellationToken);

            var viewedSet = viewedDeviceIds.ToHashSet();
            fullyViewed = recipientDeviceIds.All(viewedSet.Contains);
        }

        if (!fullyViewed)
            return;

        var receipts = await context.CharonViewReceipts
            .Where(r => r.DropId == drop.Id)
            .ToListAsync(cancellationToken);

        context.CharonViewReceipts.RemoveRange(receipts);
        context.CharonDrops.Remove(drop);
        await context.SaveChangesAsync(cancellationToken);

        await notifier.NotifyCharonDropDeleted(drop.GhostListId, drop.Id);
    }
}
