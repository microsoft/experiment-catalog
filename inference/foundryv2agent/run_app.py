"""
Console-based chat application for interacting with the Azure AI Foundry Agent.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from azure.identity.aio import DefaultAzureCredential
from dotenv import load_dotenv

from Models import ChatSessionInput, Turn, Role, GroundTruth
from Models.event_bus import EventBus, Event, EventType
from Services import ChatService, chat, init_chat

logger = logging.getLogger(__name__)


async def main():
    """
    Run the console-based chat application.
    """
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="Azure AI Foundry Agent - Console Chat"
    )
    parser.add_argument(
        "--path", type=str, help="Path to JSON file with question and history"
    )
    parser.add_argument(
        "--env_path", type=str, help="Path to .env file (defaults to .env in current directory)"
    )
    parser.add_argument(
        "--test", action="store_true", help="Test mode: answer the question from --path and exit (requires --path)"
    )
    args = parser.parse_args()

    if args.test and not args.path:
        parser.error("--test requires --path")

    # Load environment variables from .env file
    if args.env_path:
        load_dotenv(args.env_path)
        init_chat(env_path=args.env_path)
    else:
        load_dotenv()

    # Configure logging
    log_level = os.getenv("LOGGING_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        force=True,
    )

    # Suppress verbose logging from specific modules
    logging.getLogger("openai._base_client").setLevel(logging.ERROR)
    logging.getLogger("httpcore").setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.ERROR)
    logging.getLogger("azure.identity").setLevel(logging.ERROR)
    logging.getLogger("azure.core.pipeline.policies").setLevel(logging.ERROR)
    logging.getLogger("azure.ai.projects").setLevel(logging.ERROR)

    print("=" * 60)
    print("Azure AI Foundry Agent - Console Chat")
    print("=" * 60)
    print("Type 'quit' to exit\n")

    # Create credential as async context manager to ensure proper cleanup of aiohttp sessions
    async with DefaultAzureCredential() as credential:
        async with ChatService(credential) as service:
            event_bus = EventBus()

            # Track conversation history and state
            conversation_history = []  # List of all turns in conversation
            conversation_id = None
            has_received_response = False  # Track if user has received at least one response
            last_refs = []  # Store references accumulated across conversation
            turn_refs = []  # Store refs collected for each assistant turn
            last_result = None  # Store the last ChatResult for inference save

            # Subscribe to all event types
            def event_handler(event: Event):
                nonlocal last_refs

                # Capture references from FunctionCompleted events
                if event.type == EventType.FunctionCompleted and "raw_json_results" in event.data:
                    logger.info(f"Processing FunctionCompleted event: {json.dumps(event.data)}")

                    # Results are in raw_json_results
                    result_data = event.data.get("raw_json_results", {})

                    # Extract search_service and search_index from the top level
                    search_service = result_data.get("search_service", "")
                    search_index = result_data.get("search_index", "")

                    # Extract URLs from results array
                    results_list = result_data.get("results", [])
                    logger.info(f"Found {len(results_list)} results in FunctionCompleted event")

                    for result in results_list:
                        if "url" in result:
                            url = result["url"]
                            # Check if URL already exists in last_refs
                            if any(r.get("url") == url for r in last_refs):
                                logger.debug(f"Skipping duplicate URL: {url}")
                                continue

                            ref = {"url": url}
                            if search_service:
                                ref["search_service"] = search_service
                            if search_index:
                                ref["search_index"] = search_index
                            last_refs.append(ref)
                            logger.info(f"Added ref: {url}")

                    logger.debug(f"Total refs collected: {len(last_refs)}")
                else:
                    # special case for checking debug flag because json.dumps can be expensive
                    if logger.isEnabledFor(logging.DEBUG):
                        logger.debug(f"[EVENT]: {event.type.value}")
                        logger.debug(f"[DATA]: {json.dumps(event.data)[:100]}")

            for event_type in EventType:
                event_bus.subscribe(event_type, event_handler)

            # If --path is provided, load and process the question from the file
            if args.path:
                try:

                    # Convert GroundTruth to ChatSessionInput
                    session_input = ChatSessionInput.from_ground_truth(
                        GroundTruth.from_file(args.path), conversation_id
                    )

                    try:
                        # Clear last_refs at start of new file-loaded conversation
                        last_refs.clear()

                        # Run chat and get response
                        result = await chat.run(session_input, event_bus, service.credential)

                        # Extract response and conversation_id
                        response = result.response
                        conversation_id = result.conversation_id
                        last_result = result  # Store for save_inf

                        # Store in conversation history
                        conversation_history.extend(session_input.turns)
                        conversation_history.append(Turn(role=Role.ASSISTANT, content=response))
                        has_received_response = True

                        # Capture refs for this assistant turn
                        turn_refs.append(list(last_refs))

                        # Display response
                        print(f"\nAssistant: {response}\n")

                        if args.test:
                            return 0

                    except Exception as e:
                        logger.exception(f"Error during chat: {e}")
                        print(f"\nError: {e}\n")
                        return 1

                except Exception as e:
                    logger.exception(f"Error loading file: {e}")
                    print(f"\nError: {e}\n")
                    return 1

            while True:
                # Get user input with appropriate prompt
                try:
                    if has_received_response:
                        prompt_text = "You (or 'save_gt'/'save_inf'/'save_all'/'new'/'quit'): "
                    else:
                        prompt_text = "You: "
                    user_input = input(prompt_text).strip()
                except (EOFError, KeyboardInterrupt):
                    print("\nExiting...")
                    break

                # Check for quit command
                if user_input.lower() == "quit" or user_input.lower() == "exit":
                    print("Goodbye!")
                    break

                # Handle save commands
                save_cmd = user_input.lower()
                if save_cmd in ("save_gt", "save_inf", "save_all") and has_received_response:
                    try:
                        filename = input("Enter filename (without .json extension): ").strip()
                        if not filename:
                            print("Filename cannot be empty. Save cancelled.\n")
                            continue

                        # Build the ground truth data structure
                        def build_ground_truth_data():
                            # Find the last user question and last assistant answer
                            last_question = ""
                            last_answer = ""
                            history_data = []

                            assistant_turn_idx = 0  # Track which assistant turn we're on for refs
                            current_turn = 0  # Turn number for all items

                            # Find the last user turn and last assistant turn
                            last_user_idx = -1
                            last_assistant_idx = -1
                            for i, turn in enumerate(conversation_history):
                                if turn.role == Role.USER:
                                    last_user_idx = i
                                elif turn.role == Role.ASSISTANT:
                                    last_assistant_idx = i

                            # Process conversation history
                            for i, turn in enumerate(conversation_history):
                                if i == last_user_idx:
                                    # This is the last user question
                                    last_question = turn.content
                                elif i == last_assistant_idx:
                                    # This is the last assistant answer
                                    last_answer = turn.content
                                else:
                                    # Everything else goes into history
                                    history_item = {
                                        "role": turn.role.value,
                                        "content": turn.content,
                                        "turn": current_turn,
                                    }

                                    # Add refs for assistant turns
                                    if turn.role == Role.ASSISTANT:
                                        if assistant_turn_idx < len(turn_refs):
                                            history_item["refs"] = turn_refs[assistant_turn_idx]
                                        assistant_turn_idx += 1

                                    history_data.append(history_item)
                                    current_turn += 1

                            return {
                                "id": filename,
                                "question": last_question,
                                "answer": last_answer,
                                "refs": last_refs,
                                "tags": [],
                                "history": history_data,
                            }

                        # Build the inference data structure
                        def build_inference_data():
                            if last_result is None:
                                return None
                            return {
                                "response": last_result.response,
                                "conversation_id": last_result.conversation_id,
                                "is_not_text_response": last_result.is_not_text_response,
                                "time_taken_in_ms": last_result.time_taken_in_ms,
                                "function_calls": [fc.model_dump() for fc in last_result.function_calls],
                            }

                        # Determine what to save based on command
                        if save_cmd == "save_gt":
                            save_data = build_ground_truth_data()
                            output_path = Path(f"{filename}.json")
                        elif save_cmd == "save_inf":
                            save_data = build_inference_data()
                            if save_data is None:
                                print("No inference result available to save.\n")
                                continue
                            output_path = Path(f"{filename}_inference.json")
                        else:  # save_all
                            gt_data = build_ground_truth_data()
                            inf_data = build_inference_data()
                            save_data = {
                                "ground_truth": gt_data,
                                "inference": inf_data,
                            }
                            output_path = Path(f"{filename}.json")

                        # Save to file
                        with open(output_path, "w", encoding="utf-8") as f:
                            json.dump(save_data, f, indent=2, ensure_ascii=False)

                        print(f"Conversation saved to {output_path}\n")

                    except Exception as e:
                        logger.error(f"Error saving conversation: {e}")
                        print(f"Error saving conversation: {e}\n")

                    continue

                # Handle new command
                if user_input.lower() == "new" and has_received_response:
                    conversation_history = []
                    conversation_id = None
                    has_received_response = False
                    last_refs.clear()
                    turn_refs = []
                    last_result = None
                    print("\nStarting new conversation...\n")
                    continue

                # Invalid command if save/new used before response
                if (
                    save_cmd in ("save_gt", "save_inf", "save_all") or user_input.lower() == "new"
                ) and not has_received_response:
                    print("Please ask a question first before using save or 'new'.\n")
                    continue

                # Skip empty input
                if not user_input:
                    continue

                # Create turn with user input
                turn = Turn(role=Role.USER, content=user_input)

                # Create session input
                session_input = ChatSessionInput(conversation_id=conversation_id, turns=[turn])

                try:
                    # Keep accumulating refs across conversation turns
                    # (refs are only cleared when starting a new conversation with 'new' command)

                    # Run chat and get response
                    result = await chat.run(session_input, event_bus, service.credential)

                    # Extract response and conversation_id
                    response = result.response
                    conversation_id = result.conversation_id
                    last_result = result  # Store for save_inf

                    # Store in conversation history
                    conversation_history.append(turn)
                    conversation_history.append(Turn(role=Role.ASSISTANT, content=response))
                    has_received_response = True

                    # Capture refs for this assistant turn
                    turn_refs.append(list(last_refs))

                    # Display response
                    print(f"\nAssistant: {response}\n")

                except Exception as e:
                    logger.exception(f"Error during chat: {e}")
                    print(f"\nError: {e}\n")


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    if exit_code is not None:
        sys.exit(exit_code)
