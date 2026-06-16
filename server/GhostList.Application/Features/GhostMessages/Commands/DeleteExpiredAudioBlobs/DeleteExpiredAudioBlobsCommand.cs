using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredAudioBlobs;

public record DeleteExpiredAudioBlobsCommand : IRequest<int>;

public class DeleteExpiredAudioBlobsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteExpiredAudioBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public Task<int> Handle(DeleteExpiredAudioBlobsCommand request, CancellationToken cancellationToken)
        => context.DeleteExpiredAudioBlobsAsync(RetentionWindow, cancellationToken);
}
