"""
Chat functionality for interacting with the Azure AI Foundry Agent.
"""

import json
import logging
import time
from pathlib import Path

from azure.identity.aio import DefaultAzureCredential
from dotenv import load_dotenv

try:
    from ..Models.event_bus import EventBus, Event, EventType
except ImportError:
    from Models.event_bus import EventBus, Event, EventType

try:
    from ..agent import get_project_client
except ImportError:
    from agent import get_project_client

try:
    from ..Models import AgentConfig, ChatSessionInput, ChatResult, FunctionCall, TokenUsage, RetryAttempt, SearchResult
except ImportError:
    from Models import AgentConfig, ChatSessionInput, ChatResult, FunctionCall, TokenUsage, RetryAttempt, SearchResult

try:
    from ..Search import SearchService
except ImportError:
    from Search import SearchService


class ChatError(Exception):
    """
    Custom exception for chat errors that includes token usage information.
    
    This exception is raised when chat.run encounters an error, preserving
    the token usage accumulated before the error occurred.
    """
    
    def __init__(self, message: str, token_usage: TokenUsage | None = None, original_error: Exception | None = None):
        super().__init__(message)
        self.message = message
        self.token_usage = token_usage
        self.original_error = original_error
        self.error_type = type(original_error).__name__ if original_error else type(self).__name__
    
    def __str__(self):
        return self.message

# Default .env path (relative to this file's parent package)
_default_env_path = Path(__file__).parent.parent / ".env"

# Configure logger
logger = logging.getLogger(__name__)

# Module-level state (initialized lazily via init())
config: AgentConfig | None = None
excluded_events: list[str] = []
_agent_cache = None
_search_service_cache = None
_initialized = False


def init(env_path: str | Path | None = None) -> None:
    """
    Initialize the chat module by loading environment variables and config.

    Can be called explicitly with a custom .env path, or will be called
    automatically with the default path on first use.

    Args:
        env_path: Path to the .env file. Defaults to <package_root>/.env.
    """
    global config, excluded_events, _initialized

    if _initialized:
        return

    resolved_path = Path(env_path) if env_path else _default_env_path
    load_dotenv(dotenv_path=resolved_path)

    config = AgentConfig(_env_file=resolved_path)

    excluded_events = [
        e.strip()
        for e in config.excluded_log_debug_unhandled_events.split(",")
        if e.strip()
    ]

    _initialized = True
    logger.info(f"Chat module initialized with env: {resolved_path}")


def _ensure_initialized() -> None:
    """Ensure the module has been initialized (lazy init with defaults)."""
    if not _initialized:
        init()


def parse_search_results(raw_output: str | dict) -> tuple[list[SearchResult], str | None, str | None]:
    """
    Parse search results from raw JSON output into SearchResult models.
    
    Args:
        raw_output: Either a JSON string or dict containing search results.
                   Expected format: {"results": [{"title": ..., "chunk_snippet": ..., "url": ..., "search_score": ...}, ...]}
    
    Returns:
        Tuple of (List of SearchResult models, search_index, search_service)
    """
    if isinstance(raw_output, str):
        try:
            data = json.loads(raw_output)
        except json.JSONDecodeError:
            logger.warning("Failed to parse search results JSON")
            return [], None, None
    else:
        data = raw_output
    
    results = data.get("results", [])
    search_results = []
    search_index = data.get("search_index")
    search_service = data.get("search_service")
    for item in results:
        try:
            # Skip if any required field is missing
            if not all(key in item for key in ("title", "chunk_snippet", "url", "search_score")):
                continue
            
            search_result = SearchResult(
                title=item["title"],
                snippet=item["chunk_snippet"],
                url=item["url"],
                score=float(item["search_score"]),
            )
            search_results.append(search_result)
        except Exception as e:
            logger.warning(f"Failed to parse search result item: {e}")
            continue
    
    return search_results, search_index, search_service


def accumulate_token_usage(total: TokenUsage | None, additional: TokenUsage | None) -> TokenUsage | None:
    """
    Accumulate token usage from multiple API calls.

    Args:
        total: The current cumulative token usage (can be None)
        additional: The new token usage to add (can be None)

    Returns:
        Updated cumulative TokenUsage, or None if both inputs are None
    """
    if additional is None:
        return total
    if total is None:
        return additional
    return TokenUsage(
        model=total.model,
        input_tokens=total.input_tokens + additional.input_tokens,
        output_tokens=total.output_tokens + additional.output_tokens,
    )


async def process_stream_response(
    stream_response, event_bus: EventBus, event_name: str
):
    """
    Process streaming response from the agent.

    Args:
        stream_response: The streaming response from the agent
        event_bus: EventBus for publishing events

    Returns:
        tuple: (full_response, function_calls, token_usage)
    """
    try:
        from ..agent import serialize_event
    except ImportError:
        from agent import serialize_event

    full_response = ""
    function_calls = []
    token_usage = None

    async for event in stream_response:
        event_type = getattr(event, "type", None)

        # Handle function calls
        if event_type == "response.output_item.done":
            item = getattr(event, "item", None)
            if item and hasattr(item, "type") and item.type == "function_call":
                function_name = getattr(item, "name", "")
                if function_name == config.search_function_name:
                    function_calls.append(item)
        elif event_type == "response.in_progress":
            # Publish first token event
            event_data = {"event_name": event_name, "event_time": time.time()}

            # Capture created_at if available
            if hasattr(event, "response") and hasattr(event.response, "created_at"):
                event_data["created_at"] = event.response.created_at

            event_bus.publish(
                Event(
                    type=EventType.FirstToken,
                    data=event_data,
                )
            )
        elif event_type == "response.output_text.delta":
            delta_text = getattr(event, "delta", "")
            # ignored for now unless we desire to support streaming
        elif event_type == "response.completed":
            # Publish last token event
            event_bus.publish(
                Event(
                    type=EventType.LastToken,
                    data={"event_name": event_name, "event_time": time.time()},
                )
            )
            if hasattr(event, "response") and hasattr(event.response, "output_text"):
                full_response = event.response.output_text
                event_data = {"response": full_response, "event_name": event_name}

                # Capture usage information if available
                if hasattr(event.response, "usage"):
                    usage = event.response.usage
                    event_data["usage"] = usage.to_dict()
                    
                    # Build TokenUsage object
                    model_name = getattr(event.response, "model", "unknown")
                    token_usage = TokenUsage(
                        model=model_name,
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                    )

                if hasattr(event.response, "model"):
                    event_data["model_name"] = event.response.model

                event_bus.publish(
                    Event(type=EventType.StreamCompleted, data=event_data)
                )
        else:
            # Log events (filter out excluded events), this is meant for debugging and looking at
            # for new event types
            if event_type not in excluded_events:
                serialized = serialize_event(event)
                logger.debug(f"[EVENT] {event_type}")
                logger.debug(f"[DATA] {serialized}")

    return full_response, function_calls, token_usage


async def get_agent(project_client):
    """
    Get the agent instance, loading it once and caching for subsequent calls.

    Args:
        project_client: The AIProjectClient to use for retrieving the agent

    Returns:
        The agent instance, or None if it fails to load
    """
    global _agent_cache

    if _agent_cache is not None:
        return _agent_cache

    try:
        agent = await project_client.agents.get(agent_name=config.azure_agent_name)
        logger.info(f"Agent loaded: {agent.name}")
        _agent_cache = agent
        return agent
    except Exception as e:
        logger.error(f"Failed to retrieve agent '{config.azure_agent_name}': {e}")
        return None


def get_search_service(credential: DefaultAzureCredential) -> SearchService:
    """
    Get the search service instance, creating it once and caching for subsequent calls.

    Args:
        credential: The Azure credential to use for authentication

    Returns:
        The SearchService instance
        
    Raises:
        RuntimeError: If search service initialization fails
    """
    global _search_service_cache

    if _search_service_cache is not None:
        return _search_service_cache

    try:
        _search_service_cache = SearchService(config, credential)
        logger.info("Search service initialized")
        return _search_service_cache
    except ValueError as e:
        logger.error(f"Search Service Error: {e}")
        raise RuntimeError(f"Unable to initialize search service: {e}")


async def run(input: ChatSessionInput, event_bus: EventBus, credential: DefaultAzureCredential) -> ChatResult:
    """
    Run an interactive chat session with the agent.

    The agent is loaded once from AZURE_AGENT_NAME and cached for the session.

    Args:
        input: ChatSessionInput with optional conversation_id and pre-populated turns.
        event_bus: EventBus for publishing conversation events.
        
    Raises:
        ChatError: When an error occurs during chat processing, includes token usage info.
    """
    _ensure_initialized()

    # Get search service (will be cached after first call)
    search_service = get_search_service(credential)

    # Get project client - use async context manager to ensure proper cleanup of aiohttp sessions
    project_client = get_project_client(credential, config)
    
    # Track token usage for error reporting
    total_token_usage: TokenUsage | None = None
    response_start_time = time.perf_counter()

    async with project_client:
        # Get agent (will be cached after first call)
        agent = await get_agent(project_client)
        if agent is None:
            raise ChatError("Unable to initialize agent", token_usage=None)

        async with project_client.get_openai_client() as openai_client:
            if not input.turns:
                raise ChatError("No turns provided in input", token_usage=None)

            # Validate that the last turn is from the user
            last_turn = input.turns[-1]
            if last_turn.role.value != "user":
                raise ChatError(
                    f"Last turn must be from user, but got role: {last_turn.role.value}",
                    token_usage=None
                )

            user_input = last_turn.content
            conversation = None

            try:
                # Use provided conversation_id if available
                if input.conversation_id:
                    logger.info(
                        f"Continuing existing conversation (id: {input.conversation_id})"
                    )
                    conversation = type("Conversation", (), {"id": input.conversation_id})()
                else:
                    # Create new conversation
                    conversation = await openai_client.conversations.create(items=[])
                    event_bus.publish(
                        Event(
                            type=EventType.ConversationCreated,
                            data={"conversation_id": conversation.id},
                        )
                    )
                    logger.info(f"Conversation started (id: {conversation.id})")

                # Add all pre-populated turns to the conversation
                logger.debug(f"Adding {len(input.turns)} turn(s) to conversation")
                for turn in input.turns:
                    await openai_client.conversations.items.create(
                        conversation_id=conversation.id,
                        items=[
                            {
                                "type": "message",
                                "role": turn.role.value,
                                "content": turn.content,
                            }
                        ],
                    )

                stream_response = await openai_client.responses.create(
                    conversation=conversation.id,
                    extra_body={
                        "agent": {"name": agent.name, "type": "agent_reference"},
                        "tool_choice": "auto",  # Let agent decide when to use tools
                    },
                    input=user_input,
                    stream=True,
                )

                full_response, function_calls, token_usage = await process_stream_response(
                    stream_response, event_bus, "ProcessUserInput"
                )
                total_token_usage = accumulate_token_usage(total_token_usage, token_usage)

            except ChatError:
                # Re-raise ChatError as-is
                raise
            except Exception as e:
                # Calculate time taken before error
                time_taken = (time.perf_counter() - response_start_time) * 1000
                raise ChatError(
                    message=str(e),
                    token_usage=total_token_usage,
                    original_error=e
                ) from e

            # Track function call results
            function_call_results: list[FunctionCall] = []

            # If no function calls, return immediately with the response
            if not function_calls:
                total_time_taken_in_ms = (time.perf_counter() - response_start_time) * 1000
                return ChatResult(
                    response=full_response,
                    conversation_id=conversation.id,
                    is_not_text_response=not full_response,
                    time_taken_in_ms=total_time_taken_in_ms,
                    function_calls=function_call_results,
                    usage=total_token_usage,
                )

            try:
                # Execute function calls
                logger.info(f"Agent made {len(function_calls)} function call(s)")

                for func_call in function_calls:
                    function_name = getattr(func_call, "name", "")
                    call_id = getattr(func_call, "call_id", "")
                    arguments_str = getattr(func_call, "arguments", "{}")

                    logger.info(
                        f"[EXECUTING] Function: {function_name} [ARGUMENTS] {arguments_str}"
                    )

                    try:
                        # Parse arguments
                        arguments = json.loads(arguments_str)

                        # Execute the function
                        if function_name == config.search_function_name:

                            event_bus.publish(
                                Event(type=EventType.FunctionStarted, data=arguments)
                            )
                            query = arguments.get("query", "")
                            top = arguments.get("top", 5)

                            # Start timing
                            start_time = time.perf_counter()
                            result = await search_service.search(query, top)
                            # Calculate duration in milliseconds
                            time_taken_in_ms = (time.perf_counter() - start_time) * 1000

                            event_bus.publish(
                                Event(
                                    type=EventType.FunctionCompleted,
                                    data={
                                        "raw_json_results": result,
                                        "time_taken_in_ms": time_taken_in_ms,
                                        "query": query,
                                        "top": top,
                                    },
                                )
                            )

                            # Add function result to conversation
                            await openai_client.conversations.items.create(
                                conversation_id=conversation.id,
                                items=[
                                    {
                                        "type": "function_call_output",
                                        "call_id": call_id,
                                        "output": json.dumps(result),
                                    }
                                ],
                            )

                            event_bus.publish(
                                Event(
                                    type=EventType.FunctionResultAdded,
                                    data={
                                        "call_id": call_id,
                                        "function_name": function_name,
                                    },
                                )
                            )

                            # Parse search results into models
                            search_results, search_index, search_service = parse_search_results(result)
                            
                            # Track successful function call
                            function_call_results.append(
                                FunctionCall(
                                    function_name=function_name,
                                    time_taken_in_ms=time_taken_in_ms,
                                    parameters=arguments,
                                    output=json.dumps(result),
                                    error=None,
                                    search_results=search_results,
                                    search_index=search_index,
                                    search_service=search_service,
                                )
                            )
                        else:
                            raise ValueError(f"Unknown function: {function_name}")

                    except Exception as func_error:
                        # Calculate duration in milliseconds
                        time_taken_in_ms = (time.perf_counter() - start_time) * 1000

                        error_msg = f"Error executing function: {str(func_error)}"
                        logger.error(error_msg)

                        event_bus.publish(
                            Event(
                                type=EventType.FunctionError,
                                data={
                                    "error": error_msg,
                                    "query": arguments.get("query", ""),
                                    "time_taken_in_ms": time_taken_in_ms,
                                },
                            )
                        )

                        # Add error to conversation
                        await openai_client.conversations.items.create(
                            conversation_id=conversation.id,
                            items=[
                                {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": json.dumps({"error": error_msg}),
                                }
                            ],
                        )

                        # Track failed function call
                        function_call_results.append(
                            FunctionCall(
                                function_name=function_name,
                                time_taken_in_ms=time_taken_in_ms,
                                parameters=arguments,
                                output=None,
                                error=error_msg,
                            )
                        )

                # Get agent's response with function results
                logger.info("Getting agent's response with function results")

                stream_response = await openai_client.responses.create(
                    conversation=conversation.id,
                    extra_body={
                        "agent": {"name": agent.name, "type": "agent_reference"},
                        "tool_choice": "auto",
                    },
                    input="",
                    stream=True,
                )

                full_response, _, token_usage = await process_stream_response(
                    stream_response, event_bus, "ProcessFunctionResults"
                )
                total_token_usage = accumulate_token_usage(total_token_usage, token_usage)

                # Calculate total response time in milliseconds
                total_time_taken_in_ms = (time.perf_counter() - response_start_time) * 1000

                return ChatResult(
                    response=full_response,
                    conversation_id=conversation.id,
                    is_not_text_response=not full_response,
                    time_taken_in_ms=total_time_taken_in_ms,
                    function_calls=function_call_results,
                    usage=total_token_usage,
                )

            except ChatError:
                # Re-raise ChatError as-is
                raise
            except Exception as e:
                raise ChatError(
                    message=str(e),
                    token_usage=total_token_usage,
                    original_error=e
                ) from e
