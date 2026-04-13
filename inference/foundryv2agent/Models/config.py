"""Configuration model for the Agent."""
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentConfig(BaseSettings):
    """Configuration settings for the Agent loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Azure AI Foundry settings
    azure_foundry_project_endpoint: str = Field(
        ...,
        description="Azure AI Foundry project endpoint URL"
    )
    azure_foundry_model_deployment: str = Field(
        ...,
        description="Azure AI Foundry model deployment name"
    )
    
    # Azure AI Search settings
    azure_ai_search: str = Field(
        ...,
        description="Azure AI Search service name"
    )
    index_name: str = Field(
        ...,
        description="Azure AI Search index name (without version suffix)"
    )
    index_version: str = Field(
        ...,
        description="Azure AI Search index version"
    )
    index_query_type: Literal["simple", "full", "semantic"] = Field(
        default="simple",
        description="Azure AI Search query type"
    )
    index_query_top: int = Field(
        default=5,
        description="Default number of search results to return"
    )
    index_query_semantic_config: str | None = Field(
        default=None,
        description="Semantic configuration name (required for semantic query type)"
    )
    
    # Agent settings
    azure_agent_name: str = Field(
        ...,
        description="Azure AI agent name"
    )
    azure_agent_description: str | None = Field(
        default=None,
        description="Azure AI agent description"
    )
    azure_agent_mode: Literal["chat", "create"] = Field(
        default="chat",
        description="Agent operation mode: 'chat' for interactive mode, 'create' to just create the agent"
    )
    
    # Logging settings
    excluded_log_debug_unhandled_events: str = Field(
        default="",
        description="Comma-separated list of event types to exclude from debug logging"
    )
    
    @computed_field
    @property
    def search_endpoint(self) -> str:
        """Computed Azure AI Search endpoint URL."""
        return f"https://{self.azure_ai_search}.search.windows.net"
    
    @computed_field
    @property
    def full_index_name(self) -> str:
        """Computed full index name with version suffix."""
        return f"{self.index_name}-index-{self.index_version}"
    
    @computed_field
    @property
    def search_function_name(self) -> str:
        """Computed search function name based on index name."""
        return f"search_{self.index_name.replace('-', '_')}"
    
    def validate_semantic_config(self) -> None:
        """Validate that semantic config is provided when using semantic query type."""
        if self.index_query_type == "semantic" and not self.index_query_semantic_config:
            raise ValueError(
                "INDEX_QUERY_SEMANTIC_CONFIG is required when using semantic query type"
            )
    
    def display(self) -> None:
        """Display the current configuration settings."""
        print(f"\nEndpoint: {self.azure_foundry_project_endpoint}")
        print(f"Model: {self.azure_foundry_model_deployment}")
        print(f"Search Endpoint: {self.search_endpoint}")
        print(f"Search Index: {self.full_index_name}")
        print(f"Query Type: {self.index_query_type}")
        print(f"Query Top: {self.index_query_top}")
        print(f"Agent Name: {self.azure_agent_name}")
        if self.azure_agent_description:
            print(f"Agent Description: {self.azure_agent_description}")
        print(f"Mode: {self.azure_agent_mode}")
        
        if self.index_query_type == "semantic":
            print(f"[info] Using semantic query type with config: '{self.index_query_semantic_config}'")
        elif self.index_query_type == "simple":
            print(f"[info] Using default query type: 'simple' (keyword search)")
        else:
            print(f"[ok] Query type: {self.index_query_type}")
        print()
