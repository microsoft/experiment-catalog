"""
Ground truth data model for chat evaluation.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from .chat_session import Turn, Role

logger = logging.getLogger(__name__)


@dataclass
class Reference:
    """Represents a reference/source for ground truth data."""
    url: str
    search_service: str
    search_index: str


@dataclass
class GroundTruth:
    """Represents ground truth data with a question and conversation history."""
    id: str
    question: str
    answer: str
    refs: list[Reference]
    tags: list[str]
    turns: list[Turn]
    meta: dict = None
    
    @classmethod
    def from_file(cls, file_path: str) -> "GroundTruth":
        """
        Parse the input JSON file to extract question and history.
        
        Args:
            file_path: Path to the JSON file
            
        Returns:
            GroundTruth object with 'question' and 'turns' parsed from the file
        """
        try:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            return cls.from_content(data)
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in file: {e}")
        except Exception as e:
            raise Exception(f"Error parsing input file: {e}")
    
    @classmethod
    def from_content(cls, data: dict) -> "GroundTruth":
        """
        Parse JSON content to extract question and history.
        
        Args:
            data: Dictionary containing the ground truth data (from json.load)
            file_name: Optional file name for reference (default: "unknown.json")
            
        Returns:
            GroundTruth object with 'question' and 'turns' parsed from the data
        """
        # Extract question
        if "question" not in data:
            raise ValueError("No 'question' field found in the data")
        
        question: str = data.get("question")
        if not question or not question.strip():
            raise ValueError("The 'question' field is empty or invalid")
        
        # Extract id
        gt_id: str = data.get("id", "unknown")
        
        # Extract answer
        answer: str = data.get("answer", "")
        
        # Extract refs
        refs = []
        refs_data = data.get("refs", [])
        if isinstance(refs_data, list):
            for ref in refs_data:
                if isinstance(ref, dict):
                    refs.append(Reference(
                        url=ref.get("url", ""),
                        search_service=ref.get("search_service", ""),
                        search_index=ref.get("search_index", "")
                    ))
        
        # Extract tags
        tags: list[str] = data.get("tags", [])
        
        # Extract and parse history
        turns = []
        history = data.get("history", [])
        
        if isinstance(history, list) and len(history) > 0:
            for item in history:
                # Parse history item - expecting role and content
                if isinstance(item, dict):
                    role_str = item.get("role", "").lower()
                    content = item.get("content", "")
                    
                    if role_str and content:
                        try:
                            role = Role.USER if role_str == "user" else Role.ASSISTANT
                            turns.append(Turn(role=role, content=content))
                        except Exception as e:
                            logger.warning(f"Skipping invalid history item: {e}")
        
        return cls(
            id=gt_id,
            question=question,
            answer=answer,
            refs=refs,
            tags=tags,
            turns=turns,            
        )
