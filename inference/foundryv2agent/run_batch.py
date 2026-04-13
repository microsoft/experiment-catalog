"""
Batch processing script that reads questions from CSV and runs inference.
Uploads ground truth results to Azure Storage.
"""

import argparse
import asyncio
import csv
import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from azure.identity.aio import DefaultAzureCredential
from azure.storage.blob.aio import BlobServiceClient
from dotenv import load_dotenv

from Models import ChatSessionInput, Turn, Role, GroundTruth
from Models.event_bus import EventBus, Event, EventType
from Services import ChatService, chat

# Load environment variables from .env file
load_dotenv()

# Configure logging
log_level = os.getenv("LOGGING_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Suppress verbose logging from specific modules
logging.getLogger("openai._base_client").setLevel(logging.ERROR)
logging.getLogger("httpcore").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("azure.identity").setLevel(logging.ERROR)
logging.getLogger("azure.core.pipeline.policies").setLevel(logging.ERROR)
logging.getLogger("azure.ai.projects").setLevel(logging.ERROR)


@dataclass
class QuestionRow:
    """Represents a single row from the CSV file."""
    question_number: str
    question: str
    answer: str  # Ground truth answer (if provided, skip inference)
    tag: str


@dataclass
class ConversationTurn:
    """Represents a turn in a conversation with its result."""
    turn_number: int
    question: str
    answer: str
    is_ground_truth: bool  # True if answer was from CSV, False if from inference
    tag: str
    refs: list = field(default_factory=list)


def parse_csv(file_path: str) -> dict[str, list[QuestionRow]]:
    """
    Parse the CSV file and group questions by question number.
    
    Args:
        file_path: Path to the CSV file
        
    Returns:
        Dictionary mapping question_number to list of QuestionRow objects (for multi-turn)
    """
    conversations = defaultdict(list)
    
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 2:
                continue
            
            question_number = row[0].strip()
            question = row[1].strip() if len(row) > 1 else ""
            answer = row[2].strip() if len(row) > 2 else ""
            tag = row[3].strip() if len(row) > 3 else ""
            
            if not question_number or not question:
                continue
            
            conversations[question_number].append(QuestionRow(
                question_number=question_number,
                question=question,
                answer=answer,
                tag=tag
            ))
    
    return conversations


async def upload_to_azure_storage(blob_service_client: BlobServiceClient, container_name: str, blob_name: str, data: dict):
    """
    Upload JSON data to Azure Storage.
    
    Args:
        blob_service_client: Azure Blob Service client
        container_name: Name of the container
        blob_name: Name of the blob
        data: Dictionary to upload as JSON
    """
    container_client = blob_service_client.get_container_client(container_name)
    
    # Ensure container exists
    try:
        await container_client.create_container()
    except Exception:
        pass  # Container likely already exists
    
    blob_client = container_client.get_blob_client(blob_name)
    json_data = json.dumps(data, indent=2, ensure_ascii=False)
    await blob_client.upload_blob(json_data, overwrite=True)
    logger.info(f"Uploaded {blob_name} to Azure Storage")


def build_ground_truth_data(conversation_id: str, turns: list[ConversationTurn], up_to_turn: int) -> dict:
    """
    Build ground truth data structure from conversation turns up to a specific turn.
    
    Args:
        conversation_id: The conversation ID (question number)
        turns: List of all conversation turns
        up_to_turn: Build GT for this turn index (0-based), using previous turns as history
        
    Returns:
        Ground truth data dictionary
    """
    if not turns or up_to_turn >= len(turns):
        return {}
    
    # Current turn's question and answer
    current_turn = turns[up_to_turn]
    current_question = current_turn.question
    current_answer = current_turn.answer
    
    # Build history from all turns before the current one
    history_data = []
    for i, turn in enumerate(turns[:up_to_turn]):
        # User turn
        history_data.append({
            "role": "user",
            "content": turn.question,
            "turn": i * 2,
        })
        # Assistant turn
        history_data.append({
            "role": "assistant",
            "content": turn.answer,
            "turn": i * 2 + 1,
            "refs": turn.refs,
        })
    
    # Get tag from current turn
    tags = [current_turn.tag] if current_turn.tag else []
    
    # Get refs from current turn
    refs = current_turn.refs
    
    # Create unique ID: conversation_id for first turn, conversation_id_turn_N for subsequent turns
    if up_to_turn == 0:
        gt_id = conversation_id
    else:
        gt_id = f"{conversation_id}_turn_{up_to_turn + 1}"
    
    return {
        "id": gt_id,
        "question": current_question,
        "answer": current_answer,
        "refs": refs,
        "tags": tags,
        "history": history_data,
    }


async def process_conversation(
    conversation_id: str,
    rows: list[QuestionRow],
    event_bus: EventBus,
    credential: DefaultAzureCredential,
) -> list[dict]:
    """
    Process a single conversation (potentially multi-turn) and return gt_data for each turn.
    
    Args:
        conversation_id: The conversation ID (question number)
        rows: List of question rows for this conversation
        event_bus: Event bus for capturing events
        credential: Azure credential
        
    Returns:
        List of ground truth data dictionaries (one per turn)
    """
    conversation_turns = []
    conversation_history = []  # Track turns for multi-turn conversations
    agent_conversation_id = None  # Track agent's conversation ID
    last_refs = []  # Track refs accumulated during conversation
    
    for turn_number, row in enumerate(rows):
        turn_refs = []
        
        # Check if we have a pre-defined ground truth answer
        if row.answer:
            # Use the ground truth answer directly - no inference needed
            logger.info(f"Conversation {conversation_id}, Turn {turn_number + 1}: Using ground truth answer")
            
            conversation_turns.append(ConversationTurn(
                turn_number=turn_number,
                question=row.question,
                answer=row.answer,
                is_ground_truth=True,
                tag=row.tag,
                refs=[],
            ))
            
            # Add to history for subsequent turns
            conversation_history.append(Turn(role=Role.USER, content=row.question))
            conversation_history.append(Turn(role=Role.ASSISTANT, content=row.answer))
        else:
            # Need to run inference
            logger.info(f"Conversation {conversation_id}, Turn {turn_number + 1}: Running inference")
            
            # Clear refs for this turn
            captured_refs = []
            
            # Create event handler to capture refs
            def ref_handler(event: Event):
                nonlocal captured_refs
                if event.type == EventType.FunctionCompleted and "raw_json_results" in event.data:
                    result_data = event.data.get("raw_json_results", {})
                    search_service = result_data.get("search_service", "")
                    search_index = result_data.get("search_index", "")
                    results_list = result_data.get("results", [])
                    
                    for result in results_list:
                        if "url" in result:
                            url = result["url"]
                            if any(r.get("url") == url for r in captured_refs):
                                continue
                            ref = {"url": url}
                            if search_service:
                                ref["search_service"] = search_service
                            if search_index:
                                ref["search_index"] = search_index
                            captured_refs.append(ref)
            
            # Subscribe to events
            event_bus.subscribe(EventType.FunctionCompleted, ref_handler)
            
            try:
                # Build turns for this request
                request_turns = list(conversation_history) + [Turn(role=Role.USER, content=row.question)]
                
                # Create session input
                session_input = ChatSessionInput(
                    conversation_id=agent_conversation_id,
                    turns=request_turns
                )
                
                # Run inference
                result = await chat.run(session_input, event_bus, credential)
                
                # Update conversation ID for subsequent turns
                agent_conversation_id = result.conversation_id
                
                # Store the turn
                conversation_turns.append(ConversationTurn(
                    turn_number=turn_number,
                    question=row.question,
                    answer=result.response,
                    is_ground_truth=False,
                    tag=row.tag,
                    refs=captured_refs,
                ))
                
                # Add to history for subsequent turns
                conversation_history.append(Turn(role=Role.USER, content=row.question))
                conversation_history.append(Turn(role=Role.ASSISTANT, content=result.response))
                
                # Accumulate refs
                last_refs.extend(captured_refs)
                
            except Exception as e:
                logger.error(f"Error processing conversation {conversation_id}, turn {turn_number + 1}: {e}")
                conversation_turns.append(ConversationTurn(
                    turn_number=turn_number,
                    question=row.question,
                    answer=f"Error: {str(e)}",
                    is_ground_truth=False,
                    tag=row.tag,
                    refs=[],
                ))
            finally:
                # Unsubscribe from events
                event_bus.unsubscribe(EventType.FunctionCompleted, ref_handler)
    
    # Build gt_data for each turn
    gt_data_list = []
    for turn_idx in range(len(conversation_turns)):
        gt_data = build_ground_truth_data(conversation_id, conversation_turns, turn_idx)
        if gt_data:
            gt_data_list.append(gt_data)
    
    return gt_data_list


async def main():
    """
    Main function to run the batch processing.
    """
    parser = argparse.ArgumentParser(
        description="Batch process questions from CSV and upload to Azure Storage"
    )
    parser.add_argument(
        "--csv", 
        type=str, 
        default="isedevblogquestions.csv",
        help="Path to the CSV file with questions"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without uploading to Azure Storage (saves locally instead)"
    )
    args = parser.parse_args()

    # Get Azure Storage configuration from environment
    storage_account_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
    container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME")
    container_path = os.getenv("AZURE_STORAGE_CONTAINER_PATH", "")
    
    if not storage_account_name or not container_name:
        if not args.dry_run:
            logger.error("AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER_NAME must be set in .env file")
            return
        else:
            logger.warning("Azure Storage not configured, running in dry-run mode")

    print("=" * 60)
    print("Batch Processing - CSV to Azure Storage")
    print("=" * 60)
    
    # Parse the CSV file
    csv_path = Path(args.csv)
    if not csv_path.exists():
        logger.error(f"CSV file not found: {csv_path}")
        return
    
    conversations = parse_csv(str(csv_path))
    print(f"Loaded {len(conversations)} conversations from {csv_path}")
    
    # Create credential and services
    async with DefaultAzureCredential() as credential:
        async with ChatService(credential) as service:
            event_bus = EventBus()
            
            # Create blob service client if not dry-run
            blob_service_client = None
            if not args.dry_run and storage_account_name:
                account_url = f"https://{storage_account_name}.blob.core.windows.net"
                blob_service_client = BlobServiceClient(account_url, credential=credential)
            
            # Track sequence number for gt files
            sequence_number = 1
            
            # Process each conversation
            for conversation_id, rows in conversations.items():
                print(f"\nProcessing conversation {conversation_id} ({len(rows)} turn(s))...")
                
                # Process the conversation and get gt data for each turn
                gt_data_list = await process_conversation(
                    conversation_id,
                    rows,
                    event_bus,
                    service.credential,
                )
                
                # Upload each gt file
                for gt_data in gt_data_list:
                    if gt_data:
                        # Generate blob name with sequence number
                        filename = f"gt_{sequence_number:04d}.json"
                        if container_path:
                            blob_name = f"{container_path}/{filename}"
                        else:
                            blob_name = filename
                        
                        if args.dry_run:
                            # Save locally instead of uploading
                            output_path = Path(f"output/{blob_name}")
                            output_path.parent.mkdir(parents=True, exist_ok=True)
                            with open(output_path, 'w', encoding='utf-8') as f:
                                json.dump(gt_data, f, indent=2, ensure_ascii=False)
                            print(f"  Saved to {output_path}")
                        else:
                            # Upload to Azure Storage
                            await upload_to_azure_storage(
                                blob_service_client,
                                container_name,
                                blob_name,
                                gt_data
                            )
                            print(f"  Uploaded {blob_name}")
                        
                        # Print summary
                        print(f"  ID: {gt_data['id']}")
                        print(f"  Question: {gt_data['question'][:50]}...")
                        print(f"  Answer: {gt_data['answer'][:50]}...")
                        print(f"  Tags: {gt_data['tags']}")
                        print(f"  History turns: {len(gt_data['history'])}")
                        
                        sequence_number += 1
            
            # Clean up blob service client
            if blob_service_client:
                await blob_service_client.close()
    
    print("\n" + "=" * 60)
    print("Batch processing complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
