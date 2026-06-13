using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Queries;

public record GetListMembersQuery(Guid ListId) : IRequest<IReadOnlyList<ListMemberDto>>;

/// <summary>
/// LastReadMessageAt is a plain timestamp (no message ids/content), so exposing
/// it for every member stays zero-knowledge compatible. The client uses it to
/// show "read by others" status on its own sent messages.
/// </summary>
public record ListMemberDto(string DeviceId, string EncryptedPayload, string InitializationVector, DateTimeOffset? LastReadMessageAt);

public class GetListMembersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetListMembersQuery, IReadOnlyList<ListMemberDto>>
{
    public async Task<IReadOnlyList<ListMemberDto>> Handle(GetListMembersQuery request, CancellationToken cancellationToken)
    {
        return await context.GhostListMembers
            .Where(m => m.GhostListId == request.ListId)
            .Select(m => new ListMemberDto(m.DeviceId, m.EncryptedPayload, m.InitializationVector, m.LastReadMessageAt))
            .ToListAsync(cancellationToken);
    }
}
