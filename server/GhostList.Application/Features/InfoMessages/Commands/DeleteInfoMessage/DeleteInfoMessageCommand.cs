using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.InfoMessages.Commands.DeleteInfoMessage;

public record DeleteInfoMessageCommand(Guid Id) : IRequest;

public class DeleteInfoMessageCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteInfoMessageCommand>
{
    public async Task Handle(DeleteInfoMessageCommand request, CancellationToken cancellationToken)
    {
        var message = await context.InfoMessages
            .FirstOrDefaultAsync(m => m.Id == request.Id, cancellationToken)
            ?? throw new NotFoundException(nameof(InfoMessage), request.Id);

        context.InfoMessages.Remove(message);
        await context.SaveChangesAsync(cancellationToken);
    }
}
