"""Event bus for pub/sub messaging."""
from collections import defaultdict
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, DefaultDict, List


class EventType(Enum):
    """Event type enumeration."""
    ConversationCreated = "ConversationCreated"
    FunctionStarted = "FunctionStarted"    
    FunctionError = "FunctionError"
    FunctionResultAdded = "FunctionResultAdded"
    Started = "Started"
    FunctionCompleted = "FunctionCompleted"
    StreamCompleted = "StreamCompleted"
    FirstToken = "FirstToken"
    LastToken = "LastToken"


@dataclass
class Event:
    """Event model with type and data."""
    type: EventType
    data: Any


class EventBus:
    """Simple event bus for publishing and subscribing to events."""
    
    def __init__(self) -> None:
        self._handlers: DefaultDict[EventType, List[Callable[[Event], None]]] = defaultdict(list)

    def subscribe(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Subscribe a handler to an event type."""
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Unsubscribe a handler from an event type."""
        self._handlers[event_type] = [h for h in self._handlers[event_type] if h is not handler]

    def publish(self, event: Event) -> None:
        """Publish an event to all subscribed handlers."""
        for h in self._handlers.get(event.type, []):
            h(event)
