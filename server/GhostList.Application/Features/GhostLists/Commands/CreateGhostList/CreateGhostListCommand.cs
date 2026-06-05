using System;
using System.Threading;
using System.Threading.Tasks;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.GhostLists.Commands.CreateGhostList;

public record CreateGhostListCommand : IRequest<Guid>;

public class CreateGhostListCommandHandler : IRequestHandler<CreateGhostListCommand, Guid>
{
    private readonly IApplicationDbContext _context;

    public CreateGhostListCommandHandler(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Guid> Handle(CreateGhostListCommand request, CancellationToken cancellationToken)
    {
        var newList = Domain.Entities.GhostList.Create();
        _context.GhostLists.Add(newList);

        await _context.SaveChangesAsync(cancellationToken);

        return newList.Id;
    }
}