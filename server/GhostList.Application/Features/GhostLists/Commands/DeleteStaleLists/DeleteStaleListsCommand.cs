using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.GhostLists.Commands.DeleteStaleLists;

public record DeleteStaleListsCommand(TimeSpan InactivityThreshold) : IRequest<int>;

public class DeleteStaleListsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteStaleListsCommand, int>
{
    public async Task<int> Handle(DeleteStaleListsCommand request, CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow - request.InactivityThreshold;

        var staleIds = await context.GhostLists
            .Where(l => l.CreatedAt < cutoff
                && !l.Items.Any(i => i.CreatedAt > cutoff)
                && !l.ChatMessages.Any(m => m.CreatedAt > cutoff))
            .Select(l => l.Id)
            .ToListAsync(cancellationToken);

        if (staleIds.Count == 0) return 0;

        await context.GhostListItems
            .Where(i => staleIds.Contains(i.GhostListId))
            .ExecuteDeleteAsync(cancellationToken);

        await context.GhostChatMessages
            .Where(m => staleIds.Contains(m.GhostListId))
            .ExecuteDeleteAsync(cancellationToken);

        await context.GhostLists
            .Where(l => staleIds.Contains(l.Id))
            .ExecuteDeleteAsync(cancellationToken);

        return staleIds.Count;
    }
}
