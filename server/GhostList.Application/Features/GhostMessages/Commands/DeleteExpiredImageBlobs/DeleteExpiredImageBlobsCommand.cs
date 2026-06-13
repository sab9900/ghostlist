using GhostList.Application.Common.Interfaces;
using MediatR;

namespace GhostList.Application.Features.GhostMessages.Commands.DeleteExpiredImageBlobs;

/// <summary>
/// Deletes stored chat-image blobs older than the retention window. The
/// placeholder <c>GhostChatMessage</c> (and its history/replies) is left
/// intact — only the encrypted image bytes are removed, preserving the
/// ephemeral character of shared images.
/// </summary>
public record DeleteExpiredImageBlobsCommand : IRequest<int>;

public class DeleteExpiredImageBlobsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteExpiredImageBlobsCommand, int>
{
    private static readonly TimeSpan RetentionWindow = TimeSpan.FromHours(48);

    public Task<int> Handle(DeleteExpiredImageBlobsCommand request, CancellationToken cancellationToken)
        => context.DeleteExpiredImageBlobsAsync(RetentionWindow, cancellationToken);
}
