# ---- Client: React + Tailwind PWA ----
FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- API: ASP.NET Core ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY server/FinTrackr.Api/FinTrackr.Api.csproj FinTrackr.Api/
RUN dotnet restore FinTrackr.Api/FinTrackr.Api.csproj
COPY server/ ./
RUN dotnet publish FinTrackr.Api/FinTrackr.Api.csproj -c Release -o /app/publish

# ---- Runtime: one container serving API + PWA ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final

LABEL org.opencontainers.image.title="FinTrackr" \
      org.opencontainers.image.description="A quiet, manual-first finance PWA: budgets, hand-kept entries, vendor memory, recurring, savings goals. Multi-user, self-hosted, SQLite." \
      org.opencontainers.image.source="https://git.slummybell.com/slummybell/finTrackr" \
      org.opencontainers.image.licenses="MIT"

# curl is only here for the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=api-build /app/publish .
COPY --from=client-build /client/dist ./wwwroot

ENV ASPNETCORE_URLS=http://+:8080 \
    ConnectionStrings__Default="Data Source=/data/fintrackr.db" \
    ReceiptsPath=/data/receipts \
    BackupsPath=/data/backups
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/health || exit 1

ENTRYPOINT ["dotnet", "FinTrackr.Api.dll"]
