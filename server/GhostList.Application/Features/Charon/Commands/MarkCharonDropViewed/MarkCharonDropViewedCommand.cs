using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Charon.Commands.MarkCharonDropViewed;

public record MarkCharonDropViewedCommand(Guid DropId, string DeviceId, string? UserId = null) : IRequest;

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
            .AnyAsync(r => r.DropId == drop.Id &&
                ((request.UserId != null && r.UserId == request.UserId) || r.DeviceId == request.DeviceId),
                cancellationToken);

        if (!alreadyViewed)
        {
            context.CharonViewReceipts.Add(new CharonViewReceipt
            {
                DropId = drop.Id,
                DeviceId = request.DeviceId,
                UserId = request.UserId,
                ViewedAt = DateTimeOffset.UtcNow,
            });

            await context.SaveChangesAsync(cancellationToken);
        }

        var recipientMembers = await context.GhostListMembers
            .Where(m => m.GhostListId == drop.GhostListId)
            .Where(m => !(
                (drop.SenderUserId != null && m.UserId != null && m.UserId == drop.SenderUserId)
                || (m.DeviceId == drop.SenderDeviceId)))
            .Select(m => new { m.DeviceId, m.UserId })
            .ToListAsync(cancellationToken);

        var recipientIdentities = recipientMembers
            .Select(m => m.UserId ?? m.DeviceId)
            .ToHashSet();

        bool fullyViewed;

        if (recipientIdentities.Count == 0)
        {
            fullyViewed = true;
        }
        else
        {
            var viewReceipts = await context.CharonViewReceipts
                .Where(r => r.DropId == drop.Id)
                .Select(r => new { r.DeviceId, r.UserId })
                .ToListAsync(cancellationToken);

            var viewedIdentities = viewReceipts
                .Select(r => r.UserId ?? r.DeviceId)
                .ToHashSet();

            fullyViewed = recipientIdentities.All(viewedIdentities.Contains);
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
