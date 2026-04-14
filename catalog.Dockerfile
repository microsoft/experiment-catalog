# Build UI first in a Node.js container
FROM --platform=$BUILDPLATFORM node:25-bookworm@sha256:3953ec6a2c10154a58ccf4ba48083ddfe3f8641d63f0d1d5cb8a4a78169123a7 AS ui-build
WORKDIR /ui
COPY ui .
RUN npm install
RUN npm run build

# create the build container
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0@sha256:f061e5a7532b36fa1d1b684857fe1f504ba92115b9934f154643266613c44c62 AS build
ARG TARGETARCH
LABEL stage=build
WORKDIR /api
COPY catalog .
RUN mkdir -p wwwroot/
COPY --from=ui-build /ui/dist/ ./wwwroot/
RUN dotnet publish -c Release -o out -a $TARGETARCH

# create the runtime container
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:ccdca44cd4f256d50187f920dc8ccc2a9ea7a8a4597ac1d51e08fddb2e3b3205
ARG INSTALL_AZURE_CLI=false
WORKDIR /app
COPY --from=build /api/out .
COPY --from=build /api/wwwroot ./wwwroot

# Conditionally install Azure CLI
RUN if [ "$INSTALL_AZURE_CLI" = "true" ]; then \
    apt-get update && \
    apt-get install -y ca-certificates curl apt-transport-https lsb-release gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -sLS https://packages.microsoft.com/keys/microsoft.asc | \
    gpg --dearmor -o /etc/apt/keyrings/microsoft.gpg && \
    chmod go+r /etc/apt/keyrings/microsoft.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" | \
    tee /etc/apt/sources.list.d/azure-cli.list && \
    apt-get update && \
    apt-get install -y azure-cli && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*; \
    fi

ENTRYPOINT ["dotnet", "exp-catalog.dll"]
