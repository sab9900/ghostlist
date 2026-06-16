using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredImageBlobs;

public record DeleteExpiredImageBlobsCommand : IRequest<int>;

public class DeleteExpiredImageBlobsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteExpiredImageBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public Task<int> Handle(DeleteExpiredImageBlobsCommand request, CancellationToken cancellationToken)
        => context.DeleteExpiredImageBlobsAsync(RetentionWindow, cancellationToken);
}
