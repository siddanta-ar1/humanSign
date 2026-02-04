"""Pydantic models for keystroke data."""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class KeystrokeEvent(BaseModel):
    """Single keystroke event from client."""
    
    event_type: Literal["keydown", "keyup", "paste", "ai_assistant"]
    key_code: int = Field(..., ge=0, description="0 for paste/ai events")
    key_char: Optional[str] = Field(None)
    client_timestamp: float = Field(..., ge=0, description="performance.now() value in ms")
    input_method: Literal["keyboard", "paste", "ai_assistant"] = "keyboard"


class KeystrokeBatchRequest(BaseModel):
    """Batch of keystroke events from client."""
    
    session_id: UUID
    events: list[KeystrokeEvent] = Field(..., min_length=1, max_length=100)
    batch_sequence: int = Field(..., ge=0)


class KeystrokeBatchResponse(BaseModel):
    """Response after processing keystroke batch."""
    
    session_id: UUID
    events_processed: int
    batch_sequence: int


class ProcessedKeystroke(BaseModel):
    """Keystroke with computed timing features."""
    
    time: datetime
    session_id: UUID
    sequence_num: int
    event_type: int  # 1=keydown, 2=keyup
    key_code: int
    key_char: Optional[str]
    client_timestamp: float
    dwell_time: Optional[float] = None
    flight_time: Optional[float] = None
