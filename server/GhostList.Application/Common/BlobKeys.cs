namespace GhostList.Application.Common;

public static class BlobKeys
{
    public static string ChatImage(Guid messageId) => $"chat-images/{messageId}";
    public static string ChatAudio(Guid messageId) => $"chat-audios/{messageId}";
    public static string ChatVideo(Guid messageId) => $"chat-videos/{messageId}";
    public static string CharonDrop(Guid dropId) => $"charon-drops/{dropId}";

    public static string ChatImagePrefix => "chat-images/";
    public static string ChatAudioPrefix => "chat-audios/";
    public static string ChatVideoPrefix => "chat-videos/";
    public static string CharonDropPrefix => "charon-drops/";
}
