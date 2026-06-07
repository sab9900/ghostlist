namespace GhostList.Application.Common.Exceptions;

public class ForbiddenException : Exception
{
    public ForbiddenException(string message = "Forbidden.") : base(message) { }
}
