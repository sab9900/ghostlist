namespace GhostList.Domain.Entities;

public class LocaleStat
{
    public DateOnly Date { get; set; }

    public string Language { get; set; } = "other";

    public string Country { get; set; } = "";

    public int RequestCount { get; set; }
}
