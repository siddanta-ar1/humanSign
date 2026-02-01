"""API module."""

from fastapi import APIRouter

from app.api.routes import keystrokes, sessions, verification, analysis

router = APIRouter(prefix="/api/v1")

router.include_router(keystrokes.router)
router.include_router(sessions.router)
router.include_router(verification.router)
router.include_router(analysis.router)

__all__ = ["router"]

