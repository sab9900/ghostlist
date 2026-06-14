using GhostList.Domain.Entities;

namespace GhostList.Application.Features.InfoMessages;

public record InfoMessageDto(Guid Id, InfoMessageType Type, string Title, string Body, DevicePlatform? TargetPlatform, DateTime CreatedAt);
