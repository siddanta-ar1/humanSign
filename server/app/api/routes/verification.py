"""Verification API routes."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services import feature_extractor, keystroke_service, ml_inference
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
    paste_count: int = 0
    paste_ratio: float = 0.0


class VerificationResult(BaseModel):
    """Verification result response."""

    session_id: UUID
    is_human: bool
    confidence_score: float
    features_summary: dict[str, float]
    computed_at: datetime
    feedback: str | None = None


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
    Run HYBRID verification on a session combining volume, ML, and burst detection.
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

    # STEP 1: VOLUME-BASED ANALYSIS
    # Separate events by type
    # event_type: 1=keydown, 2=keyup, 3=paste, 4=ai_assistant

    # Get all keydown/keyup events for timing analysis
    timing_events = [k for k in keystrokes if k.event_type in (1, 2)]

    # Detect AI bursts FIRST (sequences of extremely fast typing < 5ms)
    ai_burst_keystrokes = set()
    if len(timing_events) > 0:
        consecutive_fast = 0
        for i in range(len(timing_events)):
            k = timing_events[i]
            dwell = k.dwell_time if k.dwell_time is not None else 999.0
            flight = k.flight_time if k.flight_time is not None else 999.0

            # AI signature: < 5ms (human fast typing is 10-15ms minimum)
            if dwell < 5.0 and flight < 5.0:
                consecutive_fast += 1
                # Mark as AI if part of burst (8+ consecutive fast keys)
                if consecutive_fast >= 8:
                    # Mark all keys in this burst
                    for j in range(max(0, i - consecutive_fast + 1), i + 1):
                        if j < len(timing_events):
                            ai_burst_keystrokes.add(timing_events[j].sequence_num)
            else:
                consecutive_fast = 0

    # Separate human vs AI keystrokes based on burst detection
    keyboard_events = [
        k
        for k in keystrokes
        if k.event_type == 1 and k.sequence_num not in ai_burst_keystrokes
    ]

    paste_events = [k for k in keystrokes if k.event_type == 3]
    ai_events = [k for k in keystrokes if k.event_type == 4]

    # Count AI burst keystrokes as AI volume
    ai_burst_volume = len(
        [
            k
            for k in timing_events
            if k.event_type == 1 and k.sequence_num in ai_burst_keystrokes
        ]
    )

    # Calculate volumes (character counts)
    human_volume = len(keyboard_events)
    paste_volume = sum(k.key_code for k in paste_events)
    ai_volume = sum(k.key_code for k in ai_events) + ai_burst_volume

    total_volume = human_volume + paste_volume + ai_volume

    if total_volume == 0:
        pct_human = 0.0
        pct_paste = 0.0
        pct_ai = 0.0
    else:
        pct_human = human_volume / total_volume
        pct_paste = paste_volume / total_volume
        pct_ai = ai_volume / total_volume

    # STEP 2: ML-BASED TIMING ANALYSIS (ENABLED!)
    ml_confidence = 0.0
    ml_is_human = True
    ml_class_label = None
    ml_probabilities = {}
    features = {"total_keystrokes": len(keyboard_events), "avg_dwell_time": 0.0}

    if len(keyboard_events) >= 10:
        try:
            # Need full events (keydown + keyup) for timing analysis
            full_keyboard_events = [k for k in keystrokes if k.event_type in (1, 2)]
            features = feature_extractor.extract_features(full_keyboard_events)
            feature_array = feature_extractor.features_to_array(features)

            # RUN ML MODEL (no longer shadow!)
            ml_result = ml_inference.predict(feature_array)
            ml_is_human = ml_result.get("is_human", True)
            ml_confidence = ml_result.get("confidence", 0.0)
            ml_class_label = ml_result.get("class_label")
            ml_probabilities = ml_result.get("probabilities", {})

        except Exception as e:
            # Fallback to volume-only if ML fails
            print(f"[WARNING] ML inference failed: {e}")
            import traceback

            traceback.print_exc()

    # STEP 3: BURST DETECTION (AI signature: consecutive fast keys)
    burst_analysis = {"has_burst": False, "burst_count": 0, "burst_severity": 0.0}

    if len(keyboard_events) >= 10:
        try:
            full_keyboard_events = [k for k in keystrokes if k.event_type in (1, 2)]
            burst_analysis = feature_extractor.detect_ai_bursts(full_keyboard_events)
        except Exception as e:
            print(f"[WARNING] Burst detection failed: {e}")
            pass

    # STEP 4: HYBRID DECISION LOGIC (IMPROVED FOR 95%+ ACCURACY)
    # Stricter thresholds and multi-signal consensus
    VOLUME_THRESHOLD_STRICT = 0.05  # 5% threshold for strict detection
    VOLUME_THRESHOLD_MODERATE = (
        0.15  # 15% threshold for moderate detection (increased for tolerance)
    )
    BURST_THRESHOLD_STRICT = 0.02  # 2% burst severity for strict detection
    BURST_THRESHOLD_MODERATE = 0.05  # 5% burst severity for moderate detection
    ML_CONFIDENCE_THRESHOLD = 0.65  # ML must be 65%+ confident

    final_is_human = True
    final_confidence = 1.0
    verdict_label = "human_verified"
    friendly_feedback = ""
    detection_signals = []

    # Signal 1: Volume analysis
    volume_violation = False
    if pct_paste > VOLUME_THRESHOLD_MODERATE or pct_ai > VOLUME_THRESHOLD_MODERATE:
        volume_violation = True
        detection_signals.append("volume_high")
    elif pct_paste > VOLUME_THRESHOLD_STRICT or pct_ai > VOLUME_THRESHOLD_STRICT:
        detection_signals.append("volume_suspicious")

    # Signal 2: Burst detection
    burst_detected = False
    if burst_analysis["has_burst"]:
        if burst_analysis["burst_severity"] > BURST_THRESHOLD_STRICT:
            burst_detected = True
            detection_signals.append("burst_detected")
        elif burst_analysis["burst_severity"] > 0:
            detection_signals.append("burst_suspicious")

    # Signal 3: ML classification
    ml_non_human = False
    if ml_class_label and not ml_is_human and ml_confidence > ML_CONFIDENCE_THRESHOLD:
        ml_non_human = True
        detection_signals.append("ml_non_human")
    elif ml_class_label and not ml_is_human and ml_confidence > 0.5:
        detection_signals.append("ml_suspicious")

    # DECISION LOGIC: Require consensus from multiple signals
    num_strong_signals = len(
        [
            s
            for s in detection_signals
            if s in ["volume_high", "burst_detected", "ml_non_human"]
        ]
    )
    num_suspicious_signals = len([s for s in detection_signals if "suspicious" in s])

    # PRIORITY 1: Strong volume violation (>10% non-human)
    if volume_violation and (pct_paste > pct_ai):
        final_is_human = False
        final_confidence = min(0.99, pct_paste * 1.2)
        verdict_label = "paste_detected"
        friendly_feedback = f"PASTE DETECTED: {int(pct_paste * 100)}% of content was pasted ({paste_volume}/{total_volume} chars)."
        if num_strong_signals >= 2:
            friendly_feedback += f" Additional signals: {', '.join(detection_signals)}."

    elif volume_violation and (pct_ai >= pct_paste):
        final_is_human = False
        final_confidence = min(0.99, pct_ai * 1.2)
        verdict_label = "ai_assisted"
        friendly_feedback = f"AI DETECTED: {int(pct_ai * 100)}% of content was AI-generated ({ai_volume}/{total_volume} chars)."
        if num_strong_signals >= 2:
            friendly_feedback += f" Additional signals: {', '.join(detection_signals)}."

    # PRIORITY 2: Strong burst with volume support
    elif burst_detected and (num_strong_signals >= 2 or num_suspicious_signals >= 1):
        final_is_human = False
        final_confidence = min(0.95, burst_analysis["burst_severity"] * 20)
        verdict_label = "ai_burst_detected"
        friendly_feedback = f"AI BURST DETECTED: {burst_analysis['burst_count']} burst sequences with max length {burst_analysis.get('max_burst_length', 0)} keys. Signals: {', '.join(detection_signals)}."

    # PRIORITY 3: ML strong detection with support
    elif ml_non_human and (
        num_strong_signals >= 2
        or (num_suspicious_signals >= 1 and ml_confidence > 0.75)
    ):
        final_is_human = False
        final_confidence = ml_confidence
        verdict_label = ml_class_label if ml_class_label else "non_human_detected"

        # Get top ML probabilities for explanation
        if ml_probabilities:
            top_classes = sorted(
                ml_probabilities.items(), key=lambda x: x[1], reverse=True
            )[:3]
            classes_str = ", ".join([f"{cls}({prob:.1%})" for cls, prob in top_classes])
            friendly_feedback = f"ML DETECTION: Pattern classified as '{ml_class_label}' with {ml_confidence:.1%} confidence. Top classes: {classes_str}."
        else:
            friendly_feedback = f"ML DETECTION: Non-human pattern detected (class: {ml_class_label}, confidence: {ml_confidence:.1%})."

        if num_suspicious_signals > 0:
            friendly_feedback += f" Additional signals: {', '.join(detection_signals)}."

    # PRIORITY 4: Single strong signal or multiple suspicious signals
    elif num_strong_signals == 1 or num_suspicious_signals >= 2:
        # Suspicious but not conclusive - warn but don't fail
        final_is_human = True  # Benefit of doubt

        # Calculate confidence based on signals
        volume_score = pct_human
        ml_score = ml_confidence if ml_is_human else 0.3  # Penalize ML non-human
        burst_score = max(
            0.3, 1.0 - (burst_analysis["burst_severity"] * 10)
        )  # Penalize bursts

        final_confidence = (
            (0.4 * volume_score) + (0.35 * ml_score) + (0.25 * burst_score)
        )
        final_confidence = max(0.5, min(0.85, final_confidence))  # Cap between 50-85%

        verdict_label = "human_verified_with_warnings"
        friendly_feedback = f"HUMAN (with warnings): {int(pct_human * 100)}% typed content. Confidence: {final_confidence:.1%}. Suspicious signals detected: {', '.join(detection_signals)}."

    # PRIORITY 5: All clear - high confidence human
    else:
        # Calculate weighted confidence
        volume_score = pct_human
        ml_score = ml_confidence if ml_is_human else (1.0 - ml_confidence)
        burst_score = max(0.7, 1.0 - burst_analysis["burst_severity"])

        # Weighted average with higher weight on volume for pure human
        final_confidence = (0.5 * volume_score) + (0.3 * ml_score) + (0.2 * burst_score)
        final_confidence = min(0.98, max(0.85, final_confidence))  # 85-98% range

        final_is_human = True
        verdict_label = "human_verified"

        if ml_class_label and ml_probabilities:
            top_classes = sorted(
                ml_probabilities.items(), key=lambda x: x[1], reverse=True
            )[:2]
            classes_str = ", ".join([f"{cls}({prob:.1%})" for cls, prob in top_classes])
            friendly_feedback = f"HUMAN VERIFIED: {int(pct_human * 100)}% typed content ({human_volume}/{total_volume} chars). ML classification: {classes_str}. Confidence: {final_confidence:.1%}."
        else:
            friendly_feedback = f"HUMAN VERIFIED: {int(pct_human * 100)}% typed content ({human_volume}/{total_volume} chars). Confidence: {final_confidence:.1%}."

    # Build comprehensive summary
    features_summary = {
        "total_keystrokes": features["total_keystrokes"],
        "avg_dwell_time": round(features.get("avg_dwell_time", 0.0), 2),
        "avg_flight_time": round(features.get("avg_flight_time", 0.0), 2),
        "std_dwell_time": round(features.get("std_dwell_time", 0.0), 2),
        "std_flight_time": round(features.get("std_flight_time", 0.0), 2),
        "volume_human": human_volume,
        "volume_paste": paste_volume,
        "volume_ai": ai_volume,
        "pct_human": round(pct_human, 3),
        "pct_paste": round(pct_paste, 3),
        "pct_ai": round(pct_ai, 3),
        "ml_class": ml_class_label if ml_class_label else "not_classified",
        "ml_confidence": round(ml_confidence, 3),
        "ml_probabilities": {k: round(v, 3) for k, v in ml_probabilities.items()}
        if ml_probabilities
        else {},
        "burst_detected": burst_analysis["has_burst"],
        "burst_count": burst_analysis["burst_count"],
        "burst_severity": round(burst_analysis["burst_severity"], 3),
        "burst_max_length": burst_analysis.get("max_burst_length", 0),
        "detection_signals": detection_signals
        if "detection_signals" in locals()
        else [],
        "input_analysis": verdict_label,
    }

    return VerificationResult(
        session_id=request.session_id,
        is_human=final_is_human,
        confidence_score=max(0.0, min(1.0, final_confidence)),
        features_summary=features_summary,
        computed_at=datetime.now(timezone.utc),
        feedback=friendly_feedback,
    )


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
async def combined_verification(
    request: CombinedVerificationRequest,
) -> CombinedVerificationResult:
    """Run combined keystroke + content analysis verification."""
    # 1. Fetch Keystrokes
    keystrokes = []
    try:
        keystrokes = await keystroke_service.get_session_keystrokes(request.session_id)
    except Exception:
        pass

    # VOLUME-BASED VERIFICATION (MVP)
    # 1. Separate events
    keyboard_events = [k for k in keystrokes if k.event_type == 1]
    paste_events = [k for k in keystrokes if k.event_type == 3]
    ai_events = [k for k in keystrokes if k.event_type == 4]

    # 2. Calculate Volumes (Character Counts)
    human_volume = len(keyboard_events)
    paste_volume = sum(k.key_code for k in paste_events)
    ai_volume = sum(k.key_code for k in ai_events)

    total_volume = human_volume + paste_volume + ai_volume

    if total_volume == 0:
        pct_human = 0.0
        pct_paste = 0.0
        pct_ai = 0.0
    else:
        pct_human = human_volume / total_volume
        pct_paste = paste_volume / total_volume
        pct_ai = ai_volume / total_volume

    # 3. Determine Verdict (Strict Thresholds)
    TOLERANCE_THRESHOLD = 0.10  # 10% tolerance

    final_is_human = True
    final_confidence = 1.0
    final_verdict = "human_verified"

    if pct_paste > TOLERANCE_THRESHOLD:
        final_is_human = False
        final_confidence = pct_paste
        final_verdict = "paste_detected"

    elif pct_ai > TOLERANCE_THRESHOLD:
        final_is_human = False
        final_confidence = pct_ai
        final_verdict = "ai_assisted"

    else:
        # PURE HUMAN
        final_is_human = True
        final_confidence = pct_human
        final_verdict = "human_verified"

    # Content analysis (Shadow)
    content_result = {}
    if len(request.text_content) >= 50:
        content_result = content_analyzer.classify(request.text_content)

    return CombinedVerificationResult(
        session_id=request.session_id,
        is_human=final_is_human,
        confidence_score=max(0.0, min(1.0, final_confidence)),
        verdict=final_verdict,
        keystroke_analysis={
            "is_human": final_is_human,
            "confidence": final_confidence,
            "features": {
                "volume_human": human_volume,
                "volume_paste": paste_volume,
                "volume_ai": ai_volume,
            },
        },
        content_analysis=content_result or {},
        combined_features={
            "keystroke_weight": 1.0,  # Trust volume 100%
            "content_weight": 0.0,
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
