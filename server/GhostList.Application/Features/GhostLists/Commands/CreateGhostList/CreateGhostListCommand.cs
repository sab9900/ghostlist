using System;
using System.Threading;
using System.Threading.Tasks;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.GhostLists.Commands.CreateGhostList;

/// <param name="OwnerTokenHash">
/// SHA-256 hex hash of the client-generated owner token.
/// The server stores only the hash — the raw token never leaves the client.
/// Null for anonymous lists (no ownership enforced).
/// </param>
public record CreateGhostListCommand(string? OwnerTokenHash = null) : IRequest<Guid>;

public class CreateGhostListCommandHandler : IRequestHandler<CreateGhostListCommand, Guid>
{
    private readonly IApplicationDbContext _context;

    public CreateGhostListCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Guid> Handle(CreateGhostListCommand request, CancellationToken cancellationToken)
    {
        var newList = Domain.Entities.GhostList.Create(ownerTokenHash: request.OwnerTokenHash);
        _context.GhostLists.Add(newList);

        await _context.SaveChangesAsync(cancellationToken);
        await _context.IncrementDailyUsageAsync(UsageMetric.List, cancellationToken);

        return newList.Id;
    }
}
