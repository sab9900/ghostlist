namespace GhostList.Domain.Entities;

/// <summary>
/// The kind of creation event being recorded in <see cref="DailyUsageStat"/>.
/// </summary>
public enum UsageMetric
{
    List,
    Item,
    Message,
    Member,
}
