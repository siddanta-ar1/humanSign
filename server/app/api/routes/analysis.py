"""
Analysis API Route - Detailed Keystroke Reports

Provides comprehensive analysis of typing sessions including:
- Timing statistics and distributions
- Classification breakdown
- Anomaly detection
- Signature verification
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
import numpy as np
from datetime import datetime

from app.services.ml_inference import ml_inference, CLASSES
from app.services.feature_extractor import feature_extractor


router = APIRouter(prefix="/analysis", tags=["analysis"])


# Models
class TimingStats(BaseModel):
    """Timing statistics from keystroke data."""
    avg_dwell_ms: float = Field(..., description="Average key hold time")
    std_dwell_ms: float = Field(..., description="Std dev of dwell time")
    avg_flight_ms: float = Field(..., description="Average time between keys")
    std_flight_ms: float = Field(..., description="Std dev of flight time")
    wpm: float = Field(..., description="Words per minute estimate")
    total_keystrokes: int
    session_duration_ms: float
    pause_count: int = Field(..., description="Number of significant pauses")


class ClassProbability(BaseModel):
    """Probability for a single class."""
    class_name: str
    probability: float
    description: str


class Anomaly(BaseModel):
    """Detected anomaly in typing pattern."""
    type: str
    severity: str  # 'low', 'medium', 'high'
    description: str
    evidence: Optional[str] = None


class AnalysisReport(BaseModel):
    """Complete analysis report for a typing session."""
    # Metadata
    session_id: str
    generated_at: str
    report_version: str = "1.0"
    
    # Verdict
    verdict: str = Field(..., description="Final classification")
    verdict_label: str = Field(..., description="Human-readable verdict")
    confidence: float = Field(..., ge=0, le=1)
    is_human: bool
    
    # Detailed probabilities
    class_probabilities: list[ClassProbability]
    
    # Timing analysis
    timing_stats: TimingStats
    
    # Distributions (for visualization)
    dwell_histogram: list[int] = Field(..., description="10-bin dwell time histogram")
    flight_histogram: list[int] = Field(..., description="10-bin flight time histogram")
    
    # Anomalies
    anomalies: list[Anomaly]
    
    # Crypto verification
    signature_verified: bool = False
    signature_chain_length: int = 0
    
    # Risk score (0-100)
    risk_score: int = Field(..., ge=0, le=100, description="Overall risk score")


class AnalysisRequest(BaseModel):
    """Request for analysis report."""
    session_id: str
    include_raw_data: bool = False


# Verdict labels
VERDICT_LABELS = {
    'human_organic': '✅ Verified Human - Organic Typing',
    'human_nonnative': '✅ Verified Human - Non-Native Speaker',
    'human_coding': '✅ Verified Human - Coding Pattern',
    'paste': '⚠️ Paste Detected - Bulk Text Insertion',
    'ai_assisted': '🤖 AI-Assisted - Autocomplete Detected',
    'copy_paste_hybrid': '⚠️ Mixed Input - Copy/Paste with Typing',
}

CLASS_DESCRIPTIONS = {
    'human_organic': 'Natural typing with normal pauses and rhythm',
    'human_nonnative': 'Typing pattern of non-native English speaker',
    'human_coding': 'Programming-style typing with high symbol usage',
    'paste': 'Text was pasted (Ctrl+V) rather than typed',
    'ai_assisted': 'AI autocomplete (e.g., Copilot) was accepted',
    'copy_paste_hybrid': 'Mix of typed and pasted content',
}


@router.post("/generate", response_model=AnalysisReport)
async def generate_report(request: AnalysisRequest) -> AnalysisReport:
    """
    Generate comprehensive analysis report for a session.
    """
    # TODO: Fetch actual session data from database
    # For now, generate mock data for demonstration
    
    # Get ML prediction
    # Mock features for demo
    mock_features = np.random.rand(1, 21).astype(np.float32)
    prediction = ml_inference.predict(mock_features)
    
    # Build class probabilities
    class_probs = []
    if 'probabilities' in prediction:
        for class_name, prob in prediction['probabilities'].items():
            class_probs.append(ClassProbability(
                class_name=class_name,
                probability=prob,
                description=CLASS_DESCRIPTIONS.get(class_name, ''),
            ))
    else:
        # Binary fallback
        class_probs = [
            ClassProbability(
                class_name='human_organic',
                probability=prediction.get('confidence', 0.5),
                description=CLASS_DESCRIPTIONS['human_organic'],
            )
        ]
    
    # Sort by probability
    class_probs.sort(key=lambda x: x.probability, reverse=True)
    
    # Detect anomalies
    anomalies = detect_anomalies(mock_features[0])
    
    # Calculate risk score
    risk_score = calculate_risk_score(prediction, anomalies)
    
    verdict = prediction.get('class_label', 'unknown')
    
    return AnalysisReport(
        session_id=request.session_id,
        generated_at=datetime.utcnow().isoformat() + 'Z',
        verdict=verdict,
        verdict_label=VERDICT_LABELS.get(verdict, verdict),
        confidence=prediction.get('confidence', 0.0),
        is_human=prediction.get('is_human', False),
        class_probabilities=class_probs,
        timing_stats=TimingStats(
            avg_dwell_ms=95.0,
            std_dwell_ms=28.0,
            avg_flight_ms=120.0,
            std_flight_ms=45.0,
            wpm=52.0,
            total_keystrokes=250,
            session_duration_ms=45000.0,
            pause_count=8,
        ),
        dwell_histogram=[5, 12, 45, 78, 62, 28, 12, 5, 2, 1],
        flight_histogram=[2, 8, 25, 55, 72, 45, 22, 12, 6, 3],
        anomalies=anomalies,
        signature_verified=True,
        signature_chain_length=5,
        risk_score=risk_score,
    )


def detect_anomalies(features: np.ndarray) -> list[Anomaly]:
    """Detect anomalies in feature vector."""
    anomalies = []
    
    # Check for zero dwell (paste indicator)
    zero_dwell_idx = 12  # Index of zero_dwell_ratio in feature vector
    if len(features) > zero_dwell_idx and features[zero_dwell_idx] > 0.5:
        anomalies.append(Anomaly(
            type='high_zero_dwell',
            severity='high',
            description='High proportion of zero-duration keystrokes detected',
            evidence=f'{features[zero_dwell_idx]*100:.1f}% of keystrokes have zero dwell time',
        ))
    
    # Check for unusually consistent timing
    dwell_std_idx = 1  # Std dwell time
    if len(features) > dwell_std_idx and features[dwell_std_idx] < 5:
        anomalies.append(Anomaly(
            type='low_timing_variance',
            severity='medium',
            description='Unusually consistent keystroke timing',
            evidence='Timing variance is below normal human range',
        ))
    
    # Check for high symbol ratio (coding)
    symbol_idx = 19  # symbol_ratio
    if len(features) > symbol_idx and features[symbol_idx] > 0.3:
        anomalies.append(Anomaly(
            type='high_symbol_usage',
            severity='low',
            description='High symbol character usage detected',
            evidence='Pattern consistent with programming or technical writing',
        ))
    
    return anomalies


def calculate_risk_score(prediction: dict, anomalies: list[Anomaly]) -> int:
    """Calculate overall risk score (0-100)."""
    score = 0
    
    # Base score from classification
    class_label = prediction.get('class_label', '')
    if class_label == 'paste':
        score += 60
    elif class_label == 'ai_assisted':
        score += 40
    elif class_label == 'copy_paste_hybrid':
        score += 30
    
    # Add anomaly penalties
    for anomaly in anomalies:
        if anomaly.severity == 'high':
            score += 20
        elif anomaly.severity == 'medium':
            score += 10
        else:
            score += 5
    
    # Reduce for high confidence human
    if prediction.get('is_human', False):
        confidence = prediction.get('confidence', 0.5)
        score = int(score * (1 - confidence * 0.5))
    
    return min(100, max(0, score))


@router.get("/classes")
async def get_classes() -> dict:
    """Get available classification classes."""
    return {
        "classes": CLASSES,
        "descriptions": CLASS_DESCRIPTIONS,
        "is_multiclass": ml_inference.is_multiclass(),
    }
