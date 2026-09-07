# Build UI first in a Node.js container
FROM --platform=$BUILDPLATFORM node:26-bookworm@sha256:9f94d34c787165dca03b74e5bf9c3bf90e8de79b19aa3d87fe1fa1694bf75c89 AS ui-build
WORKDIR /ui
COPY ui .
RUN npm ci --include=optional
RUN npm run build

# create the build container
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0@sha256:4beef5b8919dcaa2dc924233bd069257e883cc7a061e09088a97d152d6a48510 AS build
ARG TARGETARCH
LABEL stage=build
WORKDIR /api
COPY catalog .
RUN mkdir -p wwwroot/
COPY --from=ui-build /ui/dist/ ./wwwroot/
RUN dotnet publish -c Release -o out -a $TARGETARCH

# create the runtime container
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:011bb5f30180717b1c8b65822ff2c99bcb96bc65af0164589751b83c7b4949f7
ARG INSTALL_AZURE_CLI=false
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
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
