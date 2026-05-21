#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="$repo_root/artifacts/dependency-inventory"

mkdir -p "$out_dir"

echo "Generating .NET dependency inventory..."
dotnet restore "$repo_root/catalog/exp-catalog.csproj"
dotnet restore "$repo_root/catalog.tests/catalog.tests.csproj"

dotnet list "$repo_root/catalog/exp-catalog.csproj" package --include-transitive --format json > "$out_dir/catalog-dotnet-packages.json"
dotnet list "$repo_root/catalog.tests/catalog.tests.csproj" package --include-transitive --format json > "$out_dir/catalog-tests-dotnet-packages.json"

echo "Generating npm dependency inventory..."
npm ci --prefix "$repo_root/ui"
npm ls --prefix "$repo_root/ui" --all --json > "$out_dir/ui-npm-packages.json"

if npx --yes license-checker-rseidelsohn --help >/dev/null 2>&1; then
  npx --yes license-checker-rseidelsohn --start "$repo_root/ui" --json > "$out_dir/ui-npm-licenses.json"
else
  echo "license-checker-rseidelsohn not available; skipping npm license export" > "$out_dir/license-export-warning.txt"
fi

echo "Dependency inventory written to $out_dir"
