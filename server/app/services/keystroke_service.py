"""Keystroke processing service."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.db import get_connection, queries
from app.models import KeystrokeBatchRequest, ProcessedKeystroke


class KeystrokeService:
    """Service for processing and storing keystroke data."""

    async def process_batch(
        self,
        batch: KeystrokeBatchRequest,
        base_sequence: int = 0,
    ) -> list[ProcessedKeystroke]:
        """
        Process a batch of keystroke events.
        
        Calculates dwell time (key hold duration) and flight time (time between keys).
        """
        processed: list[ProcessedKeystroke] = []
        keydown_times: dict[int, float] = {}
        last_keyup_time: Optional[float] = None
        
        now = datetime.now(timezone.utc)
        
        for i, event in enumerate(batch.events):
            sequence_num = base_sequence + i
            
            # DETERMINISTIC TAGGING MAPPING
            # 1=keydown, 2=keyup, 3=paste, 4=ai_assistant
            if event.input_method == 'paste':
                event_type = 3
            elif event.input_method == 'ai_assistant':
                event_type = 4
            else:
                event_type = 1 if event.event_type == "keydown" else 2
            
            dwell_time: Optional[float] = None
            flight_time: Optional[float] = None
            
            if event.event_type == "keydown":
                # Store keydown time for dwell calculation
                keydown_times[event.key_code] = event.client_timestamp
                
                # Calculate flight time from last keyup
                if last_keyup_time is not None:
                    flight_time = event.client_timestamp - last_keyup_time
                    # Filter unreasonable values
                    if flight_time < 0 or flight_time > 5000:
                        flight_time = None
                        
            elif event.event_type == "keyup":
                # Calculate dwell time
                keydown_time = keydown_times.get(event.key_code)
                if keydown_time is not None:
                    dwell_time = event.client_timestamp - keydown_time
                    # Filter unreasonable values
                    if dwell_time < 0 or dwell_time > 2000:
                        dwell_time = None
                    del keydown_times[event.key_code]
                
                last_keyup_time = event.client_timestamp
            
            processed.append(ProcessedKeystroke(
                time=now,
                session_id=batch.session_id,
                sequence_num=sequence_num,
                event_type=event_type,
                key_code=event.key_code,
                key_char=event.key_char,
                client_timestamp=event.client_timestamp,
                dwell_time=dwell_time,
                flight_time=flight_time,
            ))
        
        return processed

    async def store_batch(self, keystrokes: list[ProcessedKeystroke]) -> int:
        """Store processed keystrokes in database using bulk insert."""
        if not keystrokes:
            return 0
        
        # Prepare arrays for bulk insert
        times = [k.time for k in keystrokes]
        session_ids = [k.session_id for k in keystrokes]
        sequence_nums = [k.sequence_num for k in keystrokes]
        event_types = [k.event_type for k in keystrokes]
        key_codes = [k.key_code for k in keystrokes]
        key_chars = [k.key_char for k in keystrokes]
        client_timestamps = [k.client_timestamp for k in keystrokes]
        dwell_times = [k.dwell_time for k in keystrokes]
        flight_times = [k.flight_time for k in keystrokes]
        
        async with get_connection() as conn:
            await conn.execute(
                queries.INSERT_KEYSTROKES_BATCH,
                times,
                session_ids,
                sequence_nums,
                event_types,
                key_codes,
                key_chars,
                client_timestamps,
                dwell_times,
                flight_times,
            )
        
        return len(keystrokes)

    async def get_session_keystrokes(self, session_id: UUID) -> list[ProcessedKeystroke]:
        """Retrieve all keystrokes for a session."""
        async with get_connection() as conn:
            rows = await conn.fetch(queries.GET_SESSION_KEYSTROKES, session_id)
        
        return [
            ProcessedKeystroke(
                time=row["time"],
                session_id=row["session_id"],
                sequence_num=row["sequence_num"],
                event_type=row["event_type"],
                key_code=row["key_code"],
                key_char=row["key_char"],
                client_timestamp=row["client_timestamp"],
                dwell_time=row["dwell_time"],
                flight_time=row["flight_time"],
            )
            for row in rows
        ]


# Singleton instance
keystroke_service = KeystrokeService()
