using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Commands.DeleteStaleLists;

public record DeleteMemberlessListsCommand : IRequest<int>;

public class DeleteMemberlessListsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteMemberlessListsCommand, int>
{
    public async Task<int> Handle(DeleteMemberlessListsCommand request, CancellationToken cancellationToken)
    {
        // Delete every list that has no members left.
        // Items, chat messages, members and device subscriptions all have ON DELETE CASCADE,
        // so deleting the list row is sufficient.
        var deleted = await context.GhostLists
            .Where(l => !context.GhostListMembers.Any(m => m.GhostListId == l.Id))
            .ExecuteDeleteAsync(cancellationToken);

        return deleted;
    }
}
