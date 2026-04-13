"""Chat session input models."""
from enum import Enum
from typing import Optional, TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .ground_truth import GroundTruth


class Role(str, Enum):
    """Role enum for chat turns."""
    ASSISTANT = "assistant"
    USER = "user"


class Turn(BaseModel):
    """Represents a single turn in a conversation."""
    
    role: Role = Field(..., description="Role of the speaker")
    content: str = Field(..., description="Text content from user or generated response")
    
    model_config = {
        "frozen": True  # Makes properties read-only
    }


class ChatSessionInput(BaseModel):
    """Input model for run_chat_session function."""
    
    conversation_id: Optional[str] = Field(None, description="Optional existing conversation ID")
    turns: list[Turn] = Field(default_factory=list, description="Array of conversation turns")
    
    model_config = {
        "frozen": True  # Makes properties read-only
    }
    
    @classmethod
    def ContinueConversation(cls, conversation_id: str, user_content: str) -> "ChatSessionInput":
        """
        Create a ChatSessionInput for continuing an existing conversation.
        
        Args:
            conversation_id: The existing conversation ID to continue
            user_content: The user's message content
            
        Returns:
            ChatSessionInput with conversation_id and a single user turn
        """
        turn = Turn(role=Role.USER, content=user_content)
        return cls(conversation_id=conversation_id, turns=[turn])
    
    @classmethod
    def from_ground_truth(cls, ground_truth: "GroundTruth", conversation_id: Optional[str] = None) -> "ChatSessionInput":
        """
        Create a ChatSessionInput from a GroundTruth object.
        
        Args:
            ground_truth: GroundTruth object containing question and history turns
            conversation_id: Optional conversation ID to associate with the session
            
        Returns:
            ChatSessionInput with history turns and the question as a new user turn
        """
        # Combine history turns with the question as a new user turn
        all_turns = ground_truth.turns + [Turn(role=Role.USER, content=ground_truth.question)]
        return cls(conversation_id=conversation_id, turns=all_turns)
    
    def add_turn(self, turn_array: list[Turn]) -> "ChatSessionInput":
        """
        Create a new ChatSessionInput with additional turns.
        
        Since the model is frozen (read-only), this returns a new instance
        with the combined turns.
        
        Args:
            turn_array: Array of Turn objects to add
            
        Returns:
            New ChatSessionInput with existing and new turns combined
        """
        combined_turns = list(self.turns) + turn_array
        return ChatSessionInput(
            conversation_id=self.conversation_id,
            turns=combined_turns
        )


class FunctionCall(BaseModel):
    """Result model for a function call."""
    
    function_name: str = Field(..., description="Name of the function called")
    time_taken_in_ms: float = Field(..., description="Time taken to execute function in milliseconds")
    parameters: dict = Field(..., description="Parameters passed to the function")
    output: Optional[str] = Field(None, description="Output from the function")
    error: Optional[str] = Field(None, description="Error message if the function failed")
    search_results: list["SearchResult"] = Field(default_factory=list, description="List of search results from the function call")
    search_index: Optional[str] = Field(None, description="Name of the search index the result came from")
    search_service: Optional[str] = Field(None, description="Name of the search service the result came from")    
    model_config = {
        "frozen": True  # Makes properties read-only
    }

class SearchResult(BaseModel):
    """Model for individual search results."""
    
    title: str = Field(..., description="Title of the search result")
    snippet: str = Field(..., description="Snippet or summary of the search result")
    url: str = Field(..., description="URL of the search result")
    score: float = Field(..., description="Relevance score of the search result")
    model_config = {
        "frozen": True  # Makes properties read-only
    }

class TokenUsage(BaseModel):
    """Token usage model for tracking model consumption."""
    
    model: str = Field(..., description="The model name")
    input_tokens: int = Field(..., description="Number of input tokens")
    output_tokens: int = Field(..., description="Number of output tokens")
    
    model_config = {
        "frozen": True  # Makes properties read-only
    }


class RetryAttempt(BaseModel):
    """Model for tracking a single retry attempt."""
    
    attempt_number: int = Field(..., description="The attempt number (1-indexed)")
    error_message: str = Field(..., description="The error message from the failed attempt")
    error_type: str = Field(..., description="The type/class of the error")
    token_usage: Optional[TokenUsage] = Field(None, description="Token usage accumulated before the error")
    time_taken_in_ms: float = Field(..., description="Time taken before the error in milliseconds")
    
    model_config = {
        "frozen": True  # Makes properties read-only
    }


class ChatResult(BaseModel):
    """Result model for chat session runs."""
    
    response: str = Field(..., description="The agent's response text")
    conversation_id: str = Field(..., description="The conversation ID")
    is_not_text_response: bool = Field(..., description="Whether the response is not a text response")
    time_taken_in_ms: float = Field(..., description="Time taken to generate response in milliseconds")
    function_calls: list[FunctionCall] = Field(default_factory=list, description="List of function calls made during the session")
    usage: Optional[TokenUsage] = Field(None, description="Token usage for the chat session")
    retries: list[RetryAttempt] = Field(default_factory=list, description="List of retry attempts if any occurred")
    in_error: bool = Field(default=False, description="Whether the result is from an error condition (e.g., all retries exhausted)")
    
    model_config = {
        "frozen": True  # Makes properties read-only
    }
