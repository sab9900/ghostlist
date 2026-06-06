using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;

public record DeleteExpiredListItemsCommand : IRequest<int>;

public class DeleteExpiredListItemsCommandHandler(
    IApplicationDbContext context,
    IGhostListNotifier notifier)
    : IRequestHandler<DeleteExpiredListItemsCommand, int>
{
    public async Task<int> Handle(DeleteExpiredListItemsCommand request, CancellationToken cancellationToken)
    {
        var deleted = await context.DeleteExpiredCheckedItemsAsync(cancellationToken);

        var notifications = deleted.Select(d => notifier.NotifyItemDeleted(d.ListId, d.ItemId));
        await Task.WhenAll(notifications);

        return deleted.Count;
    }
}
