using FluentValidation;
using GhostList.Application.Common.Exceptions;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Features.Nemesis.Commands.UpdateNemesisSettings;

public record UpdateNemesisSettingsCommand(Guid ListId, int ExpiryDays, int HideAfterDays) : IRequest;

public class UpdateNemesisSettingsCommandValidator : AbstractValidator<UpdateNemesisSettingsCommand>
{
    public UpdateNemesisSettingsCommandValidator()
    {
        RuleFor(x => x.ExpiryDays).InclusiveBetween(1, 3650);
        RuleFor(x => x.HideAfterDays).InclusiveBetween(0, 365);
    }
}

public class UpdateNemesisSettingsCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateNemesisSettingsCommand>
{
    public async Task Handle(UpdateNemesisSettingsCommand request, CancellationToken cancellationToken)
    {
        var list = await context.GhostLists
            .FirstOrDefaultAsync(gl => gl.Id == request.ListId, cancellationToken)
            ?? throw new NotFoundException(nameof(GhostList), request.ListId);

        list.UpdateNemesisSettings(request.ExpiryDays, request.HideAfterDays);
        await context.SaveChangesAsync(cancellationToken);
    }
}
