import logging
import asyncio
import time
from azure.identity.aio import DefaultAzureCredential

try:
    from .Models import ChatSessionInput, GroundTruth, ChatResult, RetryAttempt
except ImportError:
    from Models import ChatSessionInput, GroundTruth, ChatResult, RetryAttempt

try:
    from .Models.event_bus import EventBus, EventType, Event
except ImportError:
    from Models.event_bus import EventBus, EventType, Event

try:
    from .Services import ChatService
except ImportError:
    from Services import ChatService

try:
    from .Services import chat
except ImportError:
    from Services import chat

try:
    from .Services.chat import ChatError
except ImportError:
    from Services.chat import ChatError

# configure logging
logger = logging.getLogger(__name__)

# Default retry configuration
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY_SECONDS = 2.0
DEFAULT_RETRY_BACKOFF_MULTIPLIER = 2.0


class InferenceService:
    def __init__(
        self,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_delay_seconds: float = DEFAULT_RETRY_DELAY_SECONDS,
        retry_backoff_multiplier: float = DEFAULT_RETRY_BACKOFF_MULTIPLIER,
    ):
        """
        Initialize the InferenceService with retry configuration.
        
        Args:
            max_retries: Maximum number of retry attempts (default: 3)
            retry_delay_seconds: Initial delay between retries in seconds (default: 2.0)
            retry_backoff_multiplier: Multiplier for exponential backoff (default: 2.0)
        """
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds
        self.retry_backoff_multiplier = retry_backoff_multiplier

    def process_inference_request(
        self,
        ground_truth_source: dict,
    ) -> dict:
        async def _run():
            event_bus = EventBus()
            retries: list[RetryAttempt] = []
            current_delay = self.retry_delay_seconds
            
            ground_truth = GroundTruth.from_content(ground_truth_source)
            # Create credential inside async context to ensure proper HTTP transport lifecycle
            async with DefaultAzureCredential() as async_credential:
                async with ChatService(async_credential) as service:
                    session_input = ChatSessionInput.from_ground_truth(ground_truth)
                    
                    for attempt in range(1, self.max_retries + 2):  # +2 because we want max_retries retries after first attempt
                        attempt_start_time = time.perf_counter()
                        
                        try:
                            result = await chat.run(session_input, event_bus, service.credential)
                            
                            # If we had retries, add them to the result
                            if retries:
                                # Create a new ChatResult with retries included
                                result = ChatResult(
                                    response=result.response,
                                    conversation_id=result.conversation_id,
                                    is_not_text_response=result.is_not_text_response,
                                    time_taken_in_ms=result.time_taken_in_ms,
                                    function_calls=result.function_calls,
                                    usage=result.usage,
                                    retries=retries,
                                )
                            return result
                            
                        except ChatError as e:
                            time_taken_in_ms = (time.perf_counter() - attempt_start_time) * 1000
                            
                            retry_attempt = RetryAttempt(
                                attempt_number=attempt,
                                error_message=e.message,
                                error_type=e.error_type,
                                token_usage=e.token_usage,
                                time_taken_in_ms=time_taken_in_ms,
                            )
                            retries.append(retry_attempt)
                            
                            logger.warning(
                                f"Attempt {attempt} failed: {e.error_type} - {e.message}. "
                                f"Token usage: {e.token_usage}"
                            )
                            
                            # Check if we've exhausted all retries
                            if attempt > self.max_retries:
                                logger.error(f"All {self.max_retries} retries exhausted. Returning with retries array.")
                                return ChatResult(
                                    response="",
                                    conversation_id="",
                                    is_not_text_response=True,
                                    time_taken_in_ms=0,
                                    function_calls=[],
                                    usage=None,
                                    retries=retries,
                                    in_error=True,
                                )
                            
                            # Wait before retry with exponential backoff
                            logger.info(f"Retrying in {current_delay} seconds...")
                            await asyncio.sleep(current_delay)
                            current_delay *= self.retry_backoff_multiplier
                    
                    # This should not be reached, but just in case
                    raise RuntimeError("Unexpected state: retry loop completed without returning or raising")
        
        return asyncio.run(_run())
