"""
Web server for running inference via HTTP endpoint.
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from azure.identity.aio import DefaultAzureCredential
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from Models import ChatResult, ChatSessionInput, GroundTruth, Role, Turn
from Models.event_bus import EventBus
from Services import ChatService, chat

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class ReferenceRequest(BaseModel):
    """Request model for reference data."""
    url: str = ""
    search_service: str = ""
    search_index: str = ""


class TurnRequest(BaseModel):
    """Request model for conversation turn."""
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Content of the turn")


class GroundTruthRequest(BaseModel):
    """Request model matching GroundTruth structure."""
    id: str = Field(..., description="Unique identifier")
    question: str = Field(..., description="The question to ask")
    answer: str = Field(default="", description="Expected answer (optional)")
    refs: list[ReferenceRequest] = Field(default_factory=list, description="References")
    tags: list[str] = Field(default_factory=list, description="Tags")
    history: list[TurnRequest] = Field(default_factory=list, description="Conversation history")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    logger.info("Starting inference web server...")
    yield
    logger.info("Shutting down inference web server...")


app = FastAPI(
    title="Inference API",
    description="API for running chat inference with GroundTruth input",
    version="1.0.0",
    lifespan=lifespan
)


def convert_request_to_ground_truth(request: GroundTruthRequest) -> GroundTruth:
    """Convert the request model to a GroundTruth dataclass."""
    from Models.ground_truth import Reference
    
    # Convert references
    refs = [
        Reference(
            url=ref.url,
            search_service=ref.search_service,
            search_index=ref.search_index
        )
        for ref in request.refs
    ]
    
    # Convert history turns
    turns = [
        Turn(
            role=Role.USER if turn.role.lower() == "user" else Role.ASSISTANT,
            content=turn.content
        )
        for turn in request.history
    ]
    
    return GroundTruth(
        id=request.id,
        question=request.question,
        answer=request.answer,
        refs=refs,
        tags=request.tags,
        turns=turns
    )


@app.post("/inference", response_model=ChatResult)
async def run_inference(request: GroundTruthRequest) -> ChatResult:
    """
    Run inference on the provided GroundTruth data.
    
    Args:
        request: GroundTruthRequest containing the question and context
        
    Returns:
        ChatResult with the agent's response
    """
    try:
        logger.info(f"Received inference request for id: {request.id}")
        
        # Convert request to GroundTruth
        ground_truth = convert_request_to_ground_truth(request)
        
        # Create event bus for tracking
        event_bus = EventBus()
        
        # Run inference directly with async context
        async with DefaultAzureCredential() as async_credential:
            async with ChatService(async_credential) as service:
                session_input = ChatSessionInput.from_ground_truth(ground_truth)
                result = await chat.run(session_input, event_bus, service.credential)
        
        logger.info(f"Inference completed for id: {request.id}")
        return result
        
    except Exception as e:
        logger.error(f"Error processing inference request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(
        "run_web:app",
        host="0.0.0.0",
        port=8010,
        reload=False,
        log_level="info"
    )
