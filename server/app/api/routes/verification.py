"""Verification API routes."""

from uuid import UUID
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services import keystroke_service, feature_extractor, ml_inference
from app.services.content_analyzer import content_analyzer

router = APIRouter(prefix="/verify", tags=["verification"])


class VerificationRequest(BaseModel):
    """Request to verify a session."""
    session_id: UUID


class ContentAnalysisRequest(BaseModel):
    """Request to analyze text content."""
    text: str
    session_id: UUID | None = None


class ContentAnalysisResult(BaseModel):
    """Content analysis result response."""
    is_human: bool
    confidence: float
    human_score: float
    verdict: str
    features: dict[str, float]


class CombinedVerificationRequest(BaseModel):
    """Request for combined keystroke + content verification."""
    session_id: UUID
    text_content: str


class VerificationResult(BaseModel):
    """Verification result response."""
    session_id: UUID
    is_human: bool
    confidence_score: float
    features_summary: dict[str, float]
    computed_at: datetime


class CombinedVerificationResult(BaseModel):
    """Combined verification result with both keystroke and content analysis."""
    session_id: UUID
    is_human: bool
    confidence_score: float
    verdict: str
    keystroke_analysis: dict[str, Any]
    content_analysis: dict[str, Any]
    combined_features: dict[str, float]
    computed_at: datetime


@router.post("", response_model=VerificationResult)
async def verify_session(request: VerificationRequest) -> VerificationResult:
    """
    Run ML verification on a session.
    """
    # Get keystrokes
    keystrokes = await keystroke_service.get_session_keystrokes(request.session_id)
    
    if not keystrokes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No keystrokes found for session {request.session_id}",
        )
    
    if len(keystrokes) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient keystrokes for verification (minimum 10 required)",
        )
    
    # Extract features
    features = feature_extractor.extract_features(keystrokes)
    feature_array = feature_extractor.features_to_array(features)
    
    # Run inference
    prediction = ml_inference.predict(feature_array)
    
    # HEURISTIC OVERRIDE
    has_ai_burst = _detect_ai_burst(keystrokes)
            
    is_human = prediction["is_human"]
    confidence = prediction["prediction_score"]
    
    # If ML says Human but we found distinct AI bursts, override
    if is_human and has_ai_burst:
        is_human = False
        confidence = 0.85 # High confidence in Heuristic
        prediction["class_label"] = "ai_assisted_heuristic"
        
    # Build summary of key features
    features_summary = {
        "total_keystrokes": features["total_keystrokes"],
        "avg_dwell_time": round(features["avg_dwell_time"], 2),
        "avg_flight_time": round(features["avg_flight_time"], 2),
        "avg_wpm": round(features["avg_wpm"], 1),
        "error_rate": round(features["error_rate"], 4),
        "pause_count": features["pause_count"],
        "ai_burst_detected": 1.0 if has_ai_burst else 0.0
    }
    
    return VerificationResult(
        session_id=request.session_id,
        is_human=is_human,
        confidence_score=max(0.0, min(1.0, confidence)),
        features_summary=features_summary,
        computed_at=datetime.now(timezone.utc),
    )


def _detect_ai_burst(keystrokes: list) -> bool:
    """Check for sequences of > 5 keys with extremely low dwell/flight (< 8ms)."""
    consecutive_fast = 0
    max_consecutive = 0
    print(f"[DEBUG] Scanning {len(keystrokes)} keys for AI burst...")
    
    for i, k in enumerate(keystrokes):
        dwell = k.dwell_time if k.dwell_time is not None else 999
        flight = k.flight_time if k.flight_time is not None else 999
        
        # Debug first few keys
        if i < 5:
            print(f"[DEBUG] Key {i}: Dwell={dwell}, Flight={flight}")

        if (dwell < 8.0 and flight < 8.0):
            consecutive_fast += 1
            if consecutive_fast >= 5:
                print(f"[DEBUG] AI Burst FOUND! {consecutive_fast} consecutive fast keys.")
                return True
        else:
            if consecutive_fast > 1:
                # Log when a sequence breaks
                print(f"[DEBUG] Sequence broke at {consecutive_fast}. Cause: Dwell={dwell}, Flight={flight}")
            max_consecutive = max(max_consecutive, consecutive_fast)
            consecutive_fast = 0
            
    print(f"[DEBUG] No AI burst found. Max consecutive: {max_consecutive}")
    return False


@router.post("/content", response_model=ContentAnalysisResult)
async def analyze_content(request: ContentAnalysisRequest) -> ContentAnalysisResult:
    """Analyze text content for AI vs human detection."""
    if len(request.text) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text too short for analysis (minimum 50 characters required)",
        )
    
    result = content_analyzer.classify(request.text)
    
    return ContentAnalysisResult(
        is_human=result["is_human"],
        confidence=result["confidence"],
        human_score=result["human_score"],
        verdict=result["verdict"],
        features=result["features"],
    )


@router.post("/combined", response_model=CombinedVerificationResult)
async def combined_verification(request: CombinedVerificationRequest) -> CombinedVerificationResult:
    """Run combined keystroke + content analysis verification."""
    keystroke_result = None
    content_result: dict | None = None
    
    # Try keystroke analysis
    try:
        keystrokes = await keystroke_service.get_session_keystrokes(request.session_id)
        if keystrokes and len(keystrokes) >= 10:
            features = feature_extractor.extract_features(keystrokes)
            feature_array = feature_extractor.features_to_array(features)
            prediction = ml_inference.predict(feature_array)
            
            # Apply Heuristic Override
            has_ai_burst = _detect_ai_burst(keystrokes)
            is_human = prediction["is_human"]
            confidence = prediction["prediction_score"]
            
            if is_human and has_ai_burst:
                is_human = False
                confidence = 0.85
            
            keystroke_result = {
                "is_human": is_human,
                "confidence": confidence,
                "features": {
                    "total_keystrokes": features["total_keystrokes"],
                    "avg_dwell_time": round(features["avg_dwell_time"], 2),
                    "ai_burst_detected": 1.0 if has_ai_burst else 0.0
                }
            }
    except Exception as e:
        keystroke_result = {"error": str(e)}
    
    # Content analysis
    if len(request.text_content) >= 50:
        content_result = content_analyzer.classify(request.text_content)
    else:
        content_result = {"error": "Text too short"}
    
    # Combine results
    if keystroke_result and "is_human" in keystroke_result and content_result and "is_human" in content_result:
        keystroke_weight = 0.6
        content_weight = 0.4
        
        combined_confidence = (
            keystroke_weight * keystroke_result["confidence"] +
            content_weight * content_result["confidence"]
        )
        
        if keystroke_result["is_human"] != content_result["is_human"]:
            combined_confidence *= 0.7
        
        is_human = keystroke_result["is_human"]
        
        if keystroke_result["is_human"] and content_result["is_human"]:
            verdict = "human_verified"
        elif not keystroke_result["is_human"] and not content_result["is_human"]:
            verdict = "ai_detected"
        else:
            verdict = "mixed_signals"
            
    elif keystroke_result and "is_human" in keystroke_result:
        is_human = keystroke_result["is_human"]
        combined_confidence = keystroke_result["confidence"] * 0.8
        verdict = "keystroke_only"
    elif content_result and "is_human" in content_result:
        is_human = content_result["is_human"]
        combined_confidence = content_result["confidence"] * 0.7
        verdict = "content_only"
    else:
        is_human = False
        combined_confidence = 0.3
        verdict = "insufficient_data"
    
    return CombinedVerificationResult(
        session_id=request.session_id,
        is_human=is_human,
        confidence_score=max(0.0, min(1.0, combined_confidence)),
        verdict=verdict,
        keystroke_analysis=keystroke_result or {},
        content_analysis=content_result or {},
        combined_features={
            "keystroke_weight": 0.6 if keystroke_result and "is_human" in keystroke_result else 0.0,
            "content_weight": 0.4 if content_result and "is_human" in content_result else 0.0,
        },
        computed_at=datetime.now(timezone.utc),
    )


@router.get("/health")
async def verification_health() -> dict[str, Any]:
    """Check if verification system is ready."""
    model_loaded = ml_inference.is_model_loaded()
    
    return {
        "status": "ready" if model_loaded else "model_not_loaded",
        "model_loaded": model_loaded,
        "content_analyzer": "ready",
    }
