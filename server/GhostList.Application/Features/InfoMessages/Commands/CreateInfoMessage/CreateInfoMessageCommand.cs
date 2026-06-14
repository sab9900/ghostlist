using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;

namespace GhostList.Application.Features.InfoMessages.Commands.CreateInfoMessage;

public record CreateInfoMessageCommand(InfoMessageType Type, string Title, string Body, DevicePlatform? TargetPlatform = null, string? Version = null) : IRequest<Guid>;

public class CreateInfoMessageCommandHandler(IApplicationDbContext context)
    : IRequestHandler<CreateInfoMessageCommand, Guid>
{
    public async Task<Guid> Handle(CreateInfoMessageCommand request, CancellationToken cancellationToken)
    {
        var message = InfoMessage.Create(request.Type, request.Title.Trim(), request.Body.Trim(), request.TargetPlatform, request.Version?.Trim());

        context.InfoMessages.Add(message);
        await context.SaveChangesAsync(cancellationToken);

        return message.Id;
    }
}
