namespace GhostList.Application.Common.Interfaces;

public interface IPresenceTracker
{

    void JoinList(string connectionId, string listId, string deviceId);

    void LeaveList(string connectionId, string listId);

    void SetForeground(string connectionId, string deviceId, bool isForeground);

    void RemoveConnection(string connectionId);

    bool IsPresentInList(string listId, string deviceId);

    bool IsForeground(string deviceId);

    bool ShouldSuppress(string listId, string deviceId);
}
