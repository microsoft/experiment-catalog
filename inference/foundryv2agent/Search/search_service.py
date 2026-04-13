"""Azure AI Search service for CSE DevBlogs."""
import traceback

from azure.identity.aio import DefaultAzureCredential
from azure.search.documents.aio import SearchClient

try:
    from ..Models import AgentConfig
except ImportError:
    from Models import AgentConfig


class SearchService:
    """Service for performing Azure AI Search queries against the index."""
    
    def __init__(self, config: AgentConfig, credential: DefaultAzureCredential):
        """
        Initialize the SearchService with configuration.
        
        :param config: AgentConfig instance with search endpoint and index details.
        :raises ValueError: If semantic query type is configured without semantic configuration.
        """
        self.config = config
        # Validate semantic configuration
        self.config.validate_semantic_config()        
        self.credential = credential
    
    async def search(self, query: str, top: int = None) -> dict:
        """
        Search using Azure AI Search directly via function calling.
        This function performs a direct search query against the Azure AI Search index.
        
        :param query: The search query string.
        :param top: The number of results to return (defaults to INDEX_QUERY_TOP env var, max: 50).
        :return: Dictionary containing search results with title, content snippet, and post_slug.
        """
        if top is None:
            top = self.config.index_query_top
        
        try:
            # Use async context manager to ensure proper cleanup of aiohttp sessions
            async with SearchClient(
                endpoint=self.config.search_endpoint,
                index_name=self.config.full_index_name,
                credential=self.credential
            ) as search_client:
                # Perform the search
                search_params = {
                    "search_text": query,
                    "top": min(top, 100),  # Limit to max 100 results
                    "select": ["title", "chunk", "post_slug", "tags", "post_date", "authors"],
                    "include_total_count": True,
                    "query_type": self.config.index_query_type
                }
                
                # Add semantic configuration if using semantic query type
                if self.config.index_query_type == "semantic" and self.config.index_query_semantic_config:
                    search_params["semantic_configuration_name"] = self.config.index_query_semantic_config
                
                results = await search_client.search(**search_params)
                
                search_results = []
                async for result in results:
                    post_slug = result.get("post_slug", "")
                    url = result.get("url", "") or f"https://devblogs.microsoft.com/ise/{post_slug}" if post_slug else "N/A"
                    
                    chunk = result.get("chunk", "")
                    
                    search_results.append({
                        "title": result.get("title", "N/A"),
                        "chunk_snippet": chunk,
                        "post_slug": post_slug,
                        "url": url,
                        "tags": result.get("tags", []),
                        "authors": result.get("authors", []),
                        "post_date": str(result.get("post_date", "N/A")),
                        "search_score": result.get("@search.score", 0.0),
                        "reranker_score": result.get("@search.reranker_score", None)
                    })
                
                return {
                    "query": query,
                    "results_count": len(search_results),
                    "results": search_results,
                    "search_index": self.config.full_index_name,
                    "search_service": self.config.azure_ai_search
                }
        
        except Exception as e:
            error_detail = traceback.format_exc()
            return {
                "error": f"Search failed: {str(e)}",
                "error_detail": error_detail,
                "query": query,
                "index_name": self.config.full_index_name
            }
