#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

failures=0

run_step() {
  local label="$1"
  shift
  echo "==> Security: $label..."
  if "$@"; then
    echo "    [pass] $label"
  else
    echo "    [fail] $label"
    failures=$((failures + 1))
  fi
}

# --- .NET vulnerable packages ---
run_step "dotnet vulnerable packages" dotnet list experiment-catalog.sln package --vulnerable --include-transitive

echo
if [ "$failures" -gt 0 ]; then
  echo "Security scan failed: $failures check(s) failed."
  exit 1
fi
echo "Security scan passed."
