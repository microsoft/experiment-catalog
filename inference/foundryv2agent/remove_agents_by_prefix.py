"""
Remove Azure AI Foundry agents whose name starts with a given prefix.

This module deletes agents matching a name prefix using the Azure AI Projects v2 SDK,
with configuration loaded from a .env file.
"""

import asyncio
import argparse
from pathlib import Path

from azure.ai.projects.aio import AIProjectClient
from azure.identity.aio import DefaultAzureCredential
from dotenv import load_dotenv

from Models import AgentConfig


def load_environment(env_path: str | Path | None = None) -> None:
    """Load environment variables from a provided path or default location."""
    if env_path is None:
        resolved_env_path = Path(__file__).parent.parent / ".env"
    else:
        resolved_env_path = Path(env_path).expanduser()

    load_dotenv(dotenv_path=resolved_env_path)


async def main(prefix: str, env_path: str | Path | None = None, *, dry_run: bool = False) -> None:
    """Remove all agents whose name starts with the given prefix."""

    load_environment(env_path=env_path)
    config = AgentConfig()

    print(f"\nEndpoint: {config.azure_foundry_project_endpoint}")
    print(f"Prefix:   {prefix!r}")
    print(f"Mode:     {'DRY RUN' if dry_run else 'DELETE'}")
    print("Fetching agents...\n")

    credential = DefaultAzureCredential()
    project_client = AIProjectClient(
        endpoint=config.azure_foundry_project_endpoint,
        credential=credential,
    )

    async with credential, project_client:
        matched: list[tuple[str, str]] = []
        async for agent in project_client.agents.list():
            name = agent.name or ""
            if name.startswith(prefix):
                matched.append((agent.id, name))

        if not matched:
            print(f"  No agents found with prefix {prefix!r}.")
            return

        print(f"  Found {len(matched)} agent(s) matching prefix {prefix!r}:\n")
        for agent_id, name in matched:
            print(f"    id={agent_id}  name={name}")

        if dry_run:
            print("\n  Dry run — no agents were deleted.")
            return

        print()
        deleted = 0
        for agent_id, name in matched:
            try:
                await project_client.agents.delete(agent_id)
                deleted += 1
                print(f"  Deleted: id={agent_id}  name={name}")
            except Exception as exc:
                print(f"  FAILED:  id={agent_id}  name={name}  error={exc}")

        print(f"\nDeleted {deleted}/{len(matched)} agent(s).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove Azure AI Foundry agents by name prefix")
    parser.add_argument("prefix", help="Name prefix to match (e.g. 'test-')")
    parser.add_argument("--env-path", dest="env_path", required=False, help="Path to .env file")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true", help="List matching agents without deleting")
    args = parser.parse_args()
    asyncio.run(main(prefix=args.prefix, env_path=args.env_path, dry_run=args.dry_run))
