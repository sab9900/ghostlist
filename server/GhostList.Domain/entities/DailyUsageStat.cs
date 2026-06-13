namespace GhostList.Domain.Entities;

/// <summary>
/// Append-only counters of how many lists, items, chat messages and members
/// were created on a given UTC day. Used by the admin dashboard to show usage
/// trends. Unlike the live tables, rows here are never deleted by the cleanup
/// jobs, so they remain accurate even after lists/items get purged.
/// </summary>
public class DailyUsageStat
{
    public DateOnly Date { get; set; }

    public int ListsCreated { get; set; }
    public int ItemsCreated { get; set; }
    public int MessagesCreated { get; set; }
    public int MembersCreated { get; set; }
}
