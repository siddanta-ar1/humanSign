"""Dashboard API routes for user statistics and session history."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.db import get_pool
from app.api.routes.auth import get_current_user, UserResponse


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ==================== RESPONSE MODELS ====================

class DashboardStats(BaseModel):
    """User dashboard statistics."""
    total_sessions: int
    total_verifications: int
    total_words: int
    avg_confidence: Optional[float]
    sessions_this_week: int
    human_verified_count: int
    ai_detected_count: int


class SessionSummary(BaseModel):
    """Brief session summary for list view."""
    id: UUID
    started_at: datetime
    ended_at: Optional[datetime]
    word_count: int
    keystroke_count: int
    classification: Optional[str]
    confidence: Optional[float]
    is_active: bool


class SessionDetail(BaseModel):
    """Detailed session information."""
    id: UUID
    started_at: datetime
    ended_at: Optional[datetime]
    word_count: int
    keystroke_count: int
    classification: Optional[str]
    confidence: Optional[float]
    is_active: bool
    avg_dwell_time: Optional[float]
    avg_flight_time: Optional[float]
    typing_speed_wpm: Optional[float]
    ai_char_count: int
    paste_char_count: int


class SessionListResponse(BaseModel):
    """Paginated session list response."""
    sessions: list[SessionSummary]
    total: int
    page: int
    per_page: int
    has_more: bool


# ==================== ROUTES ====================

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: UserResponse = Depends(get_current_user)
) -> DashboardStats:
    """Get user's dashboard statistics."""
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        # Get total sessions count
        total = await conn.fetchrow(
            "SELECT COUNT(*) as count FROM sessions WHERE user_id = $1",
            current_user.id
        )
        
        # Get this week's sessions
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        week_sessions = await conn.fetchrow(
            "SELECT COUNT(*) as count FROM sessions WHERE user_id = $1 AND started_at >= $2",
            current_user.id, week_ago
        )
        
        # Get aggregated stats from session_features
        stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(*) as verified_count,
                SUM(total_keystrokes) as total_keystrokes,
                AVG(avg_dwell_time) as avg_dwell
            FROM session_features sf
            JOIN sessions s ON s.id = sf.session_id
            WHERE s.user_id = $1
            """,
            current_user.id
        )
        
        # Count by classification (would need verification results stored)
        # For now, return placeholder values
        return DashboardStats(
            total_sessions=total["count"] if total else 0,
            total_verifications=stats["verified_count"] if stats and stats["verified_count"] else 0,
            total_words=0,  # Would need to track this
            avg_confidence=None,  # Would need verification history
            sessions_this_week=week_sessions["count"] if week_sessions else 0,
            human_verified_count=0,
            ai_detected_count=0
        )


@router.get("/sessions", response_model=SessionListResponse)
async def get_session_history(
    current_user: UserResponse = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50)
) -> SessionListResponse:
    """Get paginated session history."""
    pool = await get_pool()
    offset = (page - 1) * per_page
    
    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchrow(
            "SELECT COUNT(*) as count FROM sessions WHERE user_id = $1",
            current_user.id
        )
        total_count = total["count"] if total else 0
        
        # Get sessions with their stats
        rows = await conn.fetch(
            """
            SELECT 
                s.id,
                s.started_at,
                s.ended_at,
                (s.ended_at IS NULL) as is_active,
                COALESCE(sf.total_keystrokes, 0) as keystroke_count,
                0 as word_count
            FROM sessions s
            LEFT JOIN session_features sf ON sf.session_id = s.id
            WHERE s.user_id = $1
            ORDER BY s.started_at DESC
            LIMIT $2 OFFSET $3
            """,
            current_user.id, per_page, offset
        )
        
        sessions = [
            SessionSummary(
                id=row["id"],
                started_at=row["started_at"],
                ended_at=row["ended_at"],
                word_count=row["word_count"],
                keystroke_count=row["keystroke_count"],
                classification=None,  # Would need verification results
                confidence=None,
                is_active=row["is_active"]
            )
            for row in rows
        ]
        
        return SessionListResponse(
            sessions=sessions,
            total=total_count,
            page=page,
            per_page=per_page,
            has_more=offset + len(sessions) < total_count
        )


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session_detail(
    session_id: UUID,
    current_user: UserResponse = Depends(get_current_user)
) -> SessionDetail:
    """Get detailed session information."""
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT 
                s.id,
                s.started_at,
                s.ended_at,
                (s.ended_at IS NULL) as is_active,
                sf.total_keystrokes,
                sf.avg_dwell_time,
                sf.avg_flight_time,
                sf.typing_speed_cpm,
                s.ai_char_count,
                s.paste_char_count
            FROM sessions s
            LEFT JOIN session_features sf ON sf.session_id = s.id
            WHERE s.id = $1 AND s.user_id = $2
            """,
            session_id, current_user.id
        )
        
        if not row:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        # Calculate WPM from CPM (assuming 5 chars per word)
        wpm = None
        if row["typing_speed_cpm"]:
            wpm = row["typing_speed_cpm"] / 5
        
        return SessionDetail(
            id=row["id"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            word_count=0,
            keystroke_count=row["total_keystrokes"] or 0,
            classification=None,
            confidence=None,
            is_active=row["is_active"],
            avg_dwell_time=row["avg_dwell_time"],
            avg_flight_time=row["avg_flight_time"],
            typing_speed_wpm=wpm,
            ai_char_count=row["ai_char_count"] or 0,
            paste_char_count=row["paste_char_count"] or 0
        )
