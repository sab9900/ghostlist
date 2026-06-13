namespace GhostList.Domain.Entities;

/// <summary>Category of an admin-authored <see cref="InfoMessage"/>, used to pick an icon/style on clients.</summary>
public enum InfoMessageType
{
    Info = 0,
    ReleaseNotes = 1,
    Maintenance = 2,
}
