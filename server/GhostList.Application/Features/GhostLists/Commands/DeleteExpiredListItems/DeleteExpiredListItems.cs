using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostLists.Commands.DeleteExpiredListItems;

public record DeleteExpiredListItemsCommand : IRequest<int>;

public class DeleteExpiredListItemsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteExpiredListItemsCommand, int>
{
    public Task<int> Handle(DeleteExpiredListItemsCommand request, CancellationToken cancellationToken)
        => context.DeleteExpiredCheckedItemsAsync(cancellationToken);
}
