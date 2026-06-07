using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.ListMembers.Queries;

public record GetListMembersQuery(Guid ListId) : IRequest<IReadOnlyList<ListMemberDto>>;

public record ListMemberDto(string DeviceId, string EncryptedPayload, string InitializationVector);

public class GetListMembersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetListMembersQuery, IReadOnlyList<ListMemberDto>>
{
    public async Task<IReadOnlyList<ListMemberDto>> Handle(GetListMembersQuery request, CancellationToken cancellationToken)
    {
        return await context.GhostListMembers
            .Where(m => m.GhostListId == request.ListId)
            .Select(m => new ListMemberDto(m.DeviceId, m.EncryptedPayload, m.InitializationVector))
            .ToListAsync(cancellationToken);
    }
}
