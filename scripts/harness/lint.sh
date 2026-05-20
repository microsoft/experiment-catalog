#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

failures=0

run_step() {
  local label="$1"
  shift
  echo "==> Lint: $label..."
  if "$@"; then
    echo "    [pass] $label"
  else
    echo "    [fail] $label"
    failures=$((failures + 1))
  fi
}

# --- .NET ---
run_step "dotnet format" dotnet format experiment-catalog.sln --verify-no-changes --verbosity quiet
run_step "dotnet build (warnings-as-errors)" dotnet build experiment-catalog.sln --nologo --verbosity quiet /p:TreatWarningsAsErrors=true

# --- UI (Svelte / TypeScript) ---
if [ -d "ui" ] && [ -f "ui/package.json" ]; then
  cd ui
  npm ci --silent 2>/dev/null || npm install --silent
  if npm ls eslint >/dev/null 2>&1; then
    run_step "eslint (ui)" npx eslint .
  fi
  cd "$root_dir"
fi

# --- Python (evaluation) ---
if [ -d "evaluation" ]; then
  if command -v ruff >/dev/null 2>&1; then
    run_step "ruff check (evaluation)" ruff check evaluation/
  elif command -v flake8 >/dev/null 2>&1; then
    run_step "flake8 (evaluation)" flake8 evaluation/
  else
    echo "==> Lint: [skip] no Python linter found (install ruff or flake8)"
  fi

  if command -v ruff >/dev/null 2>&1; then
    run_step "ruff format --check (evaluation)" ruff format --check evaluation/
  fi
fi

# --- Shell scripts ---
if command -v shellcheck >/dev/null 2>&1; then
  run_step "shellcheck (scripts)" shellcheck scripts/harness/*.sh scripts/audit_harness.sh
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "Lint failed: $failures check(s) failed."
  exit 1
fi
echo "Lint passed."
