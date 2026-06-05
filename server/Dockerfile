# Build context: repo root
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore — copy csproj files first for layer caching
COPY server/GhostList.Domain/GhostList.Domain.csproj             GhostList.Domain/
COPY server/GhostList.Application/GhostList.Application.csproj   GhostList.Application/
COPY server/GhostList.Infrastructure/GhostList.Infrastructure.csproj GhostList.Infrastructure/
COPY server/GhostList.WebApi/GhostList.WebApi.csproj              GhostList.WebApi/

RUN dotnet restore GhostList.WebApi/GhostList.WebApi.csproj

# Copy source and publish
COPY server/GhostList.Domain/             GhostList.Domain/
COPY server/GhostList.Application/        GhostList.Application/
COPY server/GhostList.Infrastructure/     GhostList.Infrastructure/
COPY server/GhostList.WebApi/             GhostList.WebApi/

RUN dotnet publish GhostList.WebApi/GhostList.WebApi.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080

ENTRYPOINT ["dotnet", "GhostList.WebApi.dll"]
