using System.Collections.Concurrent;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.SignalR;

namespace GhostList.WebApi.Hubs;

public sealed class SignalRRateLimitFilter : IHubFilter, IDisposable
{
    private readonly ConcurrentDictionary<string, PerConnectionLimiters> _limiters = new();

    private sealed class PerConnectionLimiters : IDisposable
    {
        public SlidingWindowRateLimiter Whisper { get; } = new(new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        });

        public SlidingWindowRateLimiter Typing { get; } = new(new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        });

        public SlidingWindowRateLimiter Media { get; } = new(new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 40,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        });

        public SlidingWindowRateLimiter Join { get; } = new(new SlidingWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromHours(1),
            SegmentsPerWindow = 6,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
        });

        public void Dispose()
        {
            Whisper.Dispose();
            Typing.Dispose();
            Media.Dispose();
            Join.Dispose();
        }
    }

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        var connectionId = invocationContext.Context.ConnectionId;
        var limiters = _limiters.GetOrAdd(connectionId, _ => new PerConnectionLimiters());

        RateLimiter? limiter = invocationContext.HubMethodName switch
        {
            nameof(GhostListHub.SendWhisper) => limiters.Whisper,
            nameof(GhostListHub.NotifyTyping) => limiters.Typing,
            nameof(GhostListHub.RelayImage) or
            nameof(GhostListHub.RelayAudio) or
            nameof(GhostListHub.RelayVideo) => limiters.Media,
            nameof(GhostListHub.JoinListRoom) => limiters.Join,
            _ => null,
        };

        if (limiter is not null)
        {
            using var lease = limiter.AttemptAcquire();
            if (!lease.IsAcquired)
                throw new HubException("Rate limit exceeded.");
        }

        return await next(invocationContext);
    }

    public Task OnConnectedAsync(HubLifetimeContext context, Func<HubLifetimeContext, Task> next)
        => next(context);

    public Task OnDisconnectedAsync(
        HubLifetimeContext context,
        Exception? exception,
        Func<HubLifetimeContext, Exception?, Task> next)
    {
        if (_limiters.TryRemove(context.Context.ConnectionId, out var limiters))
            limiters.Dispose();

        return next(context, exception);
    }

    public void Dispose()
    {
        foreach (var l in _limiters.Values)
            l.Dispose();

        _limiters.Clear();
    }
}
