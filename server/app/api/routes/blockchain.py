"""Blockchain API routes."""

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional

from app.services.blockchain_service import blockchain_service
from app.api.routes.auth import get_current_user, UserResponse

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


class AnchorRequest(BaseModel):
    """Request to anchor a session to the blockchain."""
    session_id: str
    session_hash: str


class AnchorResponse(BaseModel):
    """Blockchain anchor response."""
    tx_hash: str
    block_number: Optional[int]
    explorer_url: str
    status: str
    timestamp: str


@router.post("/anchor", response_model=AnchorResponse)
async def anchor_session(
    request: AnchorRequest,
    current_user: UserResponse = Depends(get_current_user)
) -> AnchorResponse:
    """
    Anchor a session verification proof to the Polygon blockchain.
    
    This creates an immutable record of the verification result.
    """
    # In a real app, we would verify the session exists and belongs to the user first.
    # We would also verify the session_hash matches the DB.
    
    result = blockchain_service.anchor_session(request.session_hash, request.session_id)
    
    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Blockchain error: {result['error']}"
        )
        
    return AnchorResponse(
        tx_hash=result["tx_hash"],
        block_number=result.get("block_number"),
        explorer_url=result.get("explorer_url", ""),
        status=result["status"],
        timestamp=result.get("timestamp", "")
    )


@router.get("/verify/{tx_hash}")
async def verify_anchor(tx_hash: str):
    """Verify a blockchain anchor transaction."""
    return blockchain_service.verify_anchor(tx_hash)
