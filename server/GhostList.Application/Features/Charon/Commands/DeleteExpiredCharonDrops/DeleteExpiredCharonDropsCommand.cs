using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.Charon.Commands.DeleteExpiredCharonDrops;

public record DeleteExpiredCharonDropsCommand : IRequest<int>;

public class DeleteExpiredCharonDropsCommandHandler(IApplicationDbContext context, IGhostListNotifier notifier)
    : IRequestHandler<DeleteExpiredCharonDropsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromDays(7);

    public async Task<int> Handle(DeleteExpiredCharonDropsCommand request, CancellationToken cancellationToken)
    {
        var deleted = await context.DeleteExpiredCharonDropsAsync(RetentionWindow, cancellationToken);

        var notifications = deleted.Select(d => notifier.NotifyCharonDropDeleted(d.ListId, d.ItemId));
        await Task.WhenAll(notifications);

        return deleted.Count;
    }
}
