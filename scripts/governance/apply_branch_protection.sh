#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ruleset_file="$repo_root/.github/branch-protection.ruleset.json"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to apply branch protection rulesets"
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]] && [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Set GITHUB_TOKEN or GH_TOKEN with repo admin permissions before running this script"
  exit 1
fi

owner_repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
existing_id="$(gh api "repos/$owner_repo/rulesets" --jq '.[] | select(.name == "Protect main branch") | .id' || true)"

if [[ -n "$existing_id" ]]; then
  echo "Updating existing ruleset id $existing_id"
  gh api --method PUT "repos/$owner_repo/rulesets/$existing_id" --input "$ruleset_file" >/dev/null
else
  echo "Creating ruleset from $ruleset_file"
  gh api --method POST "repos/$owner_repo/rulesets" --input "$ruleset_file" >/dev/null
fi

echo "Branch protection ruleset synced successfully"
