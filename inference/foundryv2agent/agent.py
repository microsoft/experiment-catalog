"""
Azure AI Foundry Agent creation for CSE DevBlogs using Azure AI Search.

This module creates agents using the Azure AI Projects v2 SDK.
"""

import asyncio
import argparse
import json
import os
import warnings
from pathlib import Path

from azure.ai.projects.aio import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition
from azure.identity.aio import DefaultAzureCredential
from dotenv import load_dotenv

try:
    from .Models import AgentConfig
except ImportError:
    from Models import AgentConfig


def load_environment(env_path: str | Path | None = None) -> None:
    """Load environment variables from a provided path or default location."""
    if env_path is None:
        resolved_env_path = Path(__file__).parent.parent / ".env"
    else:
        resolved_env_path = Path(env_path).expanduser()

    load_dotenv(dotenv_path=resolved_env_path)


def serialize_event(obj) -> str:
    """Serialize an event object to JSON string for logging."""
    try:
        # Suppress Pydantic serialization warnings for Azure AI Search tools
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
            # Try model_dump() for Pydantic models
            if hasattr(obj, 'model_dump'):
                return json.dumps(obj.model_dump(), indent=2, default=str)
            # Try to_dict() method
            elif hasattr(obj, 'to_dict'):
                return json.dumps(obj.to_dict(), indent=2, default=str)
            # Try __dict__ for regular objects
            elif hasattr(obj, '__dict__'):
                return json.dumps(vars(obj), indent=2, default=str)
            else:
                return str(obj)
    except Exception:
        return str(obj)


def get_project_client(
    credential: DefaultAzureCredential,
    config: AgentConfig,
) -> AIProjectClient:
    """Create and return a new Azure AI Project Client with credential.
    
    Note: We intentionally do NOT cache the client because each asyncio.run() call
    creates a new event loop. A cached client from a previous event loop will have
    its HTTP transport closed, causing "HTTP transport has already been closed" errors.
    
    Args:
        credential: The Azure credential to use for authentication
    
    Returns:
        AIProjectClient: A new configured project client
    """
    return AIProjectClient(endpoint=config.azure_foundry_project_endpoint, credential=credential)


def load_instructions() -> str:
    """Load agent instructions from file path in env or default prompt."""
    prompt_path_env = os.getenv("AGENT_PROMPT_PATH")

    if prompt_path_env:
        prompt_path = Path(prompt_path_env).expanduser()
        if not prompt_path.is_absolute():
            prompt_path = (Path(__file__).parent / prompt_path).resolve()
    else:
        prompt_path = Path(__file__).parent / "prompt.txt"

    if not prompt_path.exists():
        raise FileNotFoundError(f"Required prompt file not found: {prompt_path}")
    return prompt_path.read_text(encoding="utf-8").strip()

async def main(env_path: str | Path | None = None) -> None:
    """Main entry point for the agent."""

    load_environment(env_path=env_path)
    config = AgentConfig()

    config.display()

    instructions = load_instructions()

    credential = DefaultAzureCredential()
    project_client = get_project_client(credential=credential, config=config)
    async with credential, project_client:

        # Configure function calling for direct Azure AI Search access
        print(f"\nConfiguring function calling:")
        
        # For v2 SDK with create_version, define function tool
        search_function_def = {
            "type": "function",
            "name": config.search_function_name,
            "function": {
                "description": f"Search the {config.full_index_name} index using Azure AI Search directly via function calling. This function performs a direct search query against the Azure AI Search index.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query string."
                        },
                        "top": {
                            "type": "integer",
                            "description": f"The number of results to return (default: {config.index_query_top}, max: 50)."
                        }
                    },
                    "required": ["query"]
                }
            }
        }
        
        print(f"  - Registered function: {config.search_function_name}")
        print(f"  - This function calls Azure AI Search directly with custom logic")

        # Create the agent with function calling only
        print("\nCreating agent with function calling...")
        agent = await project_client.agents.create_version(
            agent_name=config.azure_agent_name,
            definition=PromptAgentDefinition(
                model=config.azure_foundry_model_deployment,
                instructions=instructions,
                tools=[search_function_def],
            ),
            description=config.azure_agent_description,
        )
        print(f"Agent created (id: {agent.id}, name: {agent.name}, version: {agent.version})")
        print("\nAgent created successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-path", dest="env_path", required=False)
    args = parser.parse_args()
    asyncio.run(main(env_path=args.env_path))
