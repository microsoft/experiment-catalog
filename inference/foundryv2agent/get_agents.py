"""
List all Azure AI Foundry agents.

This module lists all agents using the Azure AI Projects v2 SDK,
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


async def main(env_path: str | Path | None = None, show_prompt: bool = False) -> None:
    """List all agents in the Azure AI Foundry project."""

    load_environment(env_path=env_path)
    config = AgentConfig()

    print(f"\nEndpoint: {config.azure_foundry_project_endpoint}")
    print("Fetching agents...\n")

    credential = DefaultAzureCredential()
    project_client = AIProjectClient(
        endpoint=config.azure_foundry_project_endpoint,
        credential=credential,
    )

    async with credential, project_client:
        count = 0
        async for agent in project_client.agents.list():
            count += 1
            latest = agent.versions.latest if agent.versions else None
            kind = getattr(latest, "kind", "N/A") if latest else "N/A"
            description = getattr(latest, "description", "") or "" if latest else ""
            print(f"  [{count}] id={agent.id}  name={agent.name}  kind={kind}  description={description[:80]}")
            if show_prompt:
                try:
                    full_agent = await project_client.agents.get(agent_name=agent.name)
                    full_latest = full_agent.versions.latest if full_agent.versions else None
                    if full_latest:
                        definition = getattr(full_latest, "definition", None)
                        instructions = getattr(definition, "instructions", "") or "" if definition else ""
                        if instructions:
                            if len(instructions) <= 130:
                                print(f"         prompt: {instructions}")
                            else:
                                print(f"         prompt: {instructions[:100]} ... {instructions[-30:]}")
                        else:
                            print(f"         prompt: (none)")
                except Exception as e:
                    print(f"         prompt: (error fetching: {e})")

        if count == 0:
            print("  No agents found.")
        else:
            print(f"\nTotal agents: {count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="List all Azure AI Foundry agents")
    parser.add_argument("--env-path", dest="env_path", required=False)
    parser.add_argument("--show-prompt", dest="show_prompt", action="store_true", default=False, help="Show the first 100 characters of each agent's prompt")
    args = parser.parse_args()
    asyncio.run(main(env_path=args.env_path, show_prompt=args.show_prompt))
