using GhostList.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Subscriptions.Commands.DeleteStaleDeviceSubscriptions;

public record DeleteStaleDeviceSubscriptionsCommand : IRequest<int>;

public class DeleteStaleDeviceSubscriptionsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<DeleteStaleDeviceSubscriptionsCommand, int>
{
    // FCM tokens expire after ~270 days of inactivity; remove after 300 days to be safe
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromDays(300);

    public async Task<int> Handle(DeleteStaleDeviceSubscriptionsCommand request, CancellationToken cancellationToken)
    {
        var cutoff = DateTimeOffset.UtcNow - StaleThreshold;

        var deleted = await context.DeviceSubscriptions
            .Where(s => s.UpdatedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

        return deleted;
    }
}
