namespace GhostList.Domain.Entities;

/// <summary>Platform a push token belongs to — determines how the token is routed/sent.</summary>
public enum DevicePlatform
{
    Ios = 0,
    Android = 1,
    Web = 2,
}
