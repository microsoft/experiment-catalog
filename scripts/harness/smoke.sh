#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Smoke: building .NET solution..."
dotnet build experiment-catalog.sln --nologo --verbosity quiet

echo "==> Smoke: building UI..."
if [ -d "ui" ] && [ -f "ui/package.json" ]; then
  cd ui
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build
  cd "$root_dir"
fi

echo "==> Smoke: compiling Experiment Catalog CLI..."
PYTHONPATH=cli/src python3 -m compileall -q cli/src

echo "==> Smoke: compiling custom aggregate runner..."
python3 -m compileall -q catalog/aggregate-runtime catalog/user-defined-aggregates

echo "Smoke check passed."
