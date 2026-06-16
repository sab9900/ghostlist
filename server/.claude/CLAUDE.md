You are an expert in C#, .NET, and scalable backend architecture. You write clean, maintainable code strictly following DDD, Clean Architecture, and CQRS principles.

## Code Style

- **NEVER write comments in code.** No `//`, `/* */`, or `///` comments of any kind. The code must speak for itself.
- Enable nullable reference types. Never suppress nullable warnings.
- Use `var` only when the type is obvious from the right-hand side.

## Architecture — Non-Negotiable Rules

### Project Structure

| Project | Role |
|---|---|
| `GhostList.Domain` | Entities, Value Objects, Aggregates, Domain Events, Repository interfaces, Domain Services |
| `GhostList.Application` | Command/Query Handlers, Use Cases, Application Service interfaces |
| `GhostList.Infrastructure` | Repository implementations, EF Core, external services |
| `GhostList.WebApi` | Controllers, DTOs, minimal API endpoints |

### Domain-Driven Design (DDD)

- Organize by **bounded contexts** / features, not by technical type.
- **Domain layer** is pure: no framework dependencies, no EF Core, no MediatR imports.
  - Entities and Aggregates encapsulate business logic — no anemic domain models.
  - Value Objects are immutable (`record` or `sealed class` with private setters).
  - Repository interfaces live in the Domain layer.
- **Application layer**: Command & Query Handlers only. Orchestrates the domain, no business logic here.
- **Infrastructure layer**: Implements repository interfaces, EF Core DbContext, external services.
- **WebApi layer**: Controllers and DTOs. Maps HTTP requests to Commands/Queries via MediatR.
- Never let inner layers depend on outer layers.

### Clean Architecture

- Dependencies always point inward: WebApi → Application → Domain ← Infrastructure.
- The Domain layer has zero dependencies on any NuGet package except primitives.
- Use interfaces (ports) in Domain/Application; implement them in Infrastructure (adapters).
- DTOs live in the WebApi layer only. Never pass DTOs into Application or Domain.

### CQRS (via MediatR)

- **Every write operation** is a `record` implementing `IRequest` (Command) with a dedicated `IRequestHandler`.
- **Every read operation** is a `record` implementing `IRequest<TResult>` (Query) with a dedicated `IRequestHandler<TQuery, TResult>`.
- Commands and Queries are immutable `record` types with no behavior.
- Command Handlers return `Unit` or a minimal result (e.g., created ID) — never full domain objects.
- Query Handlers return read models / DTOs — never domain entities.
- Domain Events implement `INotification` and are handled by `INotificationHandler`s.

## Testing — Always Write Tests

- **Always write tests alongside new code — no exceptions.**
- **Domain tests** go in `GhostList.Domain.Tests`: test every Entity, Value Object, Aggregate, and Domain Service.
- **Application tests** go in `GhostList.Application.Tests`: test every Command Handler and Query Handler.
- Use **xUnit** as the test framework.
- Use **FluentAssertions** for all assertions.
- Use **NSubstitute** to mock interfaces in Application tests.
- Use `Microsoft.EntityFrameworkCore.InMemory` for infrastructure-touching Application tests.
- Follow Arrange / Act / Assert structure — no comments labeling the sections.
- Test class name: `{SubjectUnderTest}Tests`. Test method name describes the scenario and expected outcome.
- One logical assertion per test where possible.
