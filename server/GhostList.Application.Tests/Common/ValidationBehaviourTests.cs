using FluentAssertions;
using FluentValidation;
using GhostList.Application.Common.Behaviours;
using MediatR;
using NSubstitute;

namespace GhostList.Application.Tests.Common;

public record TestRequest : IRequest<string>;

public class AlwaysValidValidator : AbstractValidator<TestRequest> { }

public class AlwaysInvalidValidator : AbstractValidator<TestRequest>
{
    public AlwaysInvalidValidator()
    {
        RuleFor(x => x).Must(_ => false).WithMessage("Always fails.");
    }
}

public class ValidationBehaviourTests
{
    [Fact]
    public async Task Handle_NoValidators_CallsNext()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>([]);
        var next = Substitute.For<RequestHandlerDelegate<string>>();
        next().Returns("ok");

        var result = await behaviour.Handle(new TestRequest(), next, CancellationToken.None);

        result.Should().Be("ok");
        await next.Received(1)();
    }

    [Fact]
    public async Task Handle_ValidRequest_CallsNext()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>([new AlwaysValidValidator()]);
        var next = Substitute.For<RequestHandlerDelegate<string>>();
        next().Returns("ok");

        var result = await behaviour.Handle(new TestRequest(), next, CancellationToken.None);

        result.Should().Be("ok");
        await next.Received(1)();
    }

    [Fact]
    public async Task Handle_InvalidRequest_ThrowsValidationExceptionAndDoesNotCallNext()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>([new AlwaysInvalidValidator()]);
        var next = Substitute.For<RequestHandlerDelegate<string>>();

        var act = () => behaviour.Handle(new TestRequest(), next, CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        await next.DidNotReceive()();
    }
}
