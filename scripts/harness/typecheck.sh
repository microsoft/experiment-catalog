#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Typecheck: building .NET solution (warnings as errors)..."
dotnet build experiment-catalog.sln --nologo --verbosity quiet

if [ -d "ui" ] && [ -f "ui/package.json" ]; then
  echo "==> Typecheck: checking Svelte/TypeScript types..."
  cd ui
  npm ci --silent 2>/dev/null || npm install --silent
  npm run check
  cd "$root_dir"
fi

echo "Typecheck passed."
