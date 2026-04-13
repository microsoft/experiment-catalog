#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Test: running .NET tests..."
dotnet test experiment-catalog.sln --nologo --verbosity quiet

echo "==> Test: running UI unit tests..."
if [ -d "ui" ] && [ -f "ui/vitest.config.ts" ]; then
  cd ui
  npx vitest run
  cd "$root_dir"
fi

echo "==> Test: running UI Playwright tests..."
if [ -d "ui" ] && [ -f "ui/playwright.config.ts" ]; then
  cd ui

  # Use the Playwright Docker image for consistent cross-platform rendering.
  # Update the tag when upgrading @playwright/test in package.json.
  PW_IMAGE="mcr.microsoft.com/playwright:v1.58.2-noble"

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "    Running Playwright tests inside Docker ($PW_IMAGE)..."
    docker run --rm \
      --ipc=host \
      -v "$root_dir":/work \
      -w /work/ui \
      -e CI="${CI:-}" \
      "$PW_IMAGE" \
      bash -c "npm ci --ignore-scripts && npx playwright test"
  else
    echo "    [warn] Docker not available — running Playwright tests natively."
    npx playwright install --with-deps chromium
    npx playwright test
  fi

  cd "$root_dir"
fi

echo "Tests passed."
