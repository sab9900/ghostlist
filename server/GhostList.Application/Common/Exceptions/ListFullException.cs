namespace GhostList.Application.Common.Exceptions;

public class ListFullException : Exception
{
    public ListFullException(string message = "This list has reached its maximum number of members.") : base(message) { }
}
