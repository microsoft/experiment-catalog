"""
ChatService manages the lifecycle of Azure credentials and project client.
"""

from azure.identity.aio import DefaultAzureCredential
from azure.ai.projects.aio import AIProjectClient

try:
    from ..Models import AgentConfig
except ImportError:
    from Models import AgentConfig


class ChatService:
    """
    Async context manager that encapsulates the credential and project client lifecycle.
    """

    def __init__(self, credential: DefaultAzureCredential):
        """
        Initialize the ChatService with an Azure credential.
        
        Args:
            credential: The DefaultAzureCredential to use for authentication
        """
        self.credential = credential
        self.project_client = None

    async def __aenter__(self):
        """
        Enter the async context, initializing the project client.
        
        Note: The credential is NOT entered here because its lifecycle is managed
        by the caller. Only the project_client (which is created here) is entered.
        """
        # Initialize project client once for the entire application
        try:
            from ..agent import get_project_client
        except ImportError:
            from agent import get_project_client
        config = AgentConfig()
        self.project_client = get_project_client(self.credential, config)
        
        # Only enter the project client - credential lifecycle is managed externally
        await self.project_client.__aenter__()
        
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """
        Exit the async context, cleaning up resources.
        
        Note: The credential is NOT exited here because its lifecycle is managed
        by the caller.
        """
        # Only exit the project client - credential lifecycle is managed externally
        if self.project_client:
            await self.project_client.__aexit__(exc_type, exc_val, exc_tb)
