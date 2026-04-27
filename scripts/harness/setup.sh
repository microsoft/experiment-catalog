#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

failures=0

ok()   { echo "[ok]   $1"; }
warn() { echo "[warn] $1"; }
fail() { echo "[fail] $1"; failures=$((failures + 1)); }

echo "Setting up development environment..."
echo

# --- .NET SDK ---
echo "==> Checking .NET SDK..."
if command -v dotnet >/dev/null 2>&1; then
  dotnet_version=$(dotnet --version)
  if [[ "$dotnet_version" == 10.* ]]; then
    ok ".NET SDK $dotnet_version"
  else
    fail ".NET SDK 10.x required, found $dotnet_version"
  fi
else
  fail ".NET SDK not found (install from https://dot.net)"
fi

# --- .NET restore ---
echo "==> Restoring .NET packages..."
if dotnet restore experiment-catalog.sln --verbosity quiet; then
  ok "dotnet restore"
else
  fail "dotnet restore"
fi

# --- Node.js ---
echo "==> Checking Node.js..."
if command -v node >/dev/null 2>&1; then
  node_version=$(node --version)
  node_major=${node_version#v}
  node_major=${node_major%%.*}
  if [ "$node_major" -ge 20 ] 2>/dev/null; then
    ok "Node.js $node_version"
  else
    fail "Node.js 20+ required, found $node_version"
  fi
else
  fail "Node.js not found (install from https://nodejs.org)"
fi

# --- UI dependencies ---
if [ -d "ui" ] && [ -f "ui/package.json" ]; then
  echo "==> Installing UI dependencies..."
  cd ui
  if npm ci --silent 2>/dev/null || npm install --silent; then
    ok "npm install (ui)"
  else
    fail "npm install (ui)"
  fi

  # Install Playwright browsers for testing
  if npx playwright install chromium 2>/dev/null; then
    ok "playwright install chromium"
  else
    warn "could not install Playwright browsers — UI testing may be skipped"
  fi

  cd "$root_dir"
fi

# --- Optional tools ---
echo "==> Checking optional tools..."
if command -v shellcheck >/dev/null 2>&1; then
  ok "shellcheck available"
else
  warn "shellcheck not found — shell script linting will be skipped"
fi

if command -v make >/dev/null 2>&1; then
  ok "make available"
else
  fail "make not found"
fi

# --- Summary ---
echo
if [ "$failures" -gt 0 ]; then
  echo "Setup completed with $failures issue(s). Fix the [fail] items above."
  exit 1
fi
echo "Setup complete. Run 'make smoke' to verify."
