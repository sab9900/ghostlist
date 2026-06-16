namespace GhostList.Domain.Entities;

public class DailyUsageStat
{
    public DateOnly Date { get; set; }

    public int ListsCreated { get; set; }
    public int ItemsCreated { get; set; }
    public int MessagesCreated { get; set; }
    public int MembersCreated { get; set; }
}
