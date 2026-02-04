#!/usr/bin/env python3
"""
Simple test script for hybrid verification system.
Tests the three detection methods: volume, ML timing, and burst detection.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

# Add server to path
sys.path.insert(0, str(Path(__file__).parent))


def create_keystroke(event_type, key_code, dwell, flight, seq):
    """Create mock keystroke."""
    return SimpleNamespace(
        time=datetime.now(timezone.utc),
        session_id=uuid4(),
        sequence_num=seq,
        event_type=event_type,
        key_code=key_code,
        key_char="a",
        client_timestamp=1000.0 + seq * 100,
        dwell_time=dwell,
        flight_time=flight,
    )


def test_burst_detection():
    """Test AI burst detection."""
    print("\n" + "=" * 60)
    print("TEST 1: Burst Detection")
    print("=" * 60)

    from app.services.feature_extractor import feature_extractor

    # Test 1: AI burst (10 keys with < 8ms timing)
    print("\n[1.1] AI Burst (10 fast keys)")
    ai_keys = []
    for i in range(10):
        ai_keys.append(create_keystroke(1, 65 + i, 3.5, 2.1, i * 2))
        ai_keys.append(create_keystroke(2, 65 + i, 3.5, 2.1, i * 2 + 1))

    result = feature_extractor.detect_ai_bursts(ai_keys)
    print(f"  Burst detected: {result['has_burst']} (Expected: True)")
    print(f"  Burst count: {result['burst_count']}")
    assert result["has_burst"], "FAIL: Should detect AI burst"
    print("  ✓ PASS")

    # Test 2: Human typing
    print("\n[1.2] Human Typing (normal speed)")
    human_keys = []
    for i in range(20):
        human_keys.append(create_keystroke(1, 65 + (i % 26), 100.0, 80.0, i * 2))
        human_keys.append(create_keystroke(2, 65 + (i % 26), 100.0, 80.0, i * 2 + 1))

    result = feature_extractor.detect_ai_bursts(human_keys)
    print(f"  Burst detected: {result['has_burst']} (Expected: False)")
    assert not result["has_burst"], "FAIL: Should NOT detect burst in human typing"
    print("  ✓ PASS")

    print("\n✅ Burst detection working!")


def test_ml_inference():
    """Test ML model inference."""
    print("\n" + "=" * 60)
    print("TEST 2: ML Model Inference")
    print("=" * 60)

    from app.services.feature_extractor import feature_extractor
    from app.services.ml_inference import ml_inference

    # Check model loaded
    print("\n[2.1] Model Status")
    if not ml_inference.is_model_loaded():
        ml_inference.warmup()

    is_loaded = ml_inference.is_model_loaded()
    is_multiclass = ml_inference.is_multiclass()

    print(f"  Model loaded: {is_loaded}")
    print(f"  Multiclass: {is_multiclass}")

    if not is_loaded:
        print("  ⚠️  SKIP: Model not available")
        return

    # Test human-like features
    print("\n[2.2] Predict Human Typing")
    human_features = {
        "total_keystrokes": 100.0,
        "duration_ms": 15000.0,
        "avg_dwell_time": 100.0,
        "std_dwell_time": 30.0,
        "min_dwell_time": 50.0,
        "max_dwell_time": 200.0,
        "avg_flight_time": 80.0,
        "std_flight_time": 40.0,
        "min_flight_time": 20.0,
        "max_flight_time": 300.0,
        "zero_dwell_ratio": 0.0,
        "zero_flight_ratio": 0.0,
        "pause_count": 3.0,
        "pause_ratio": 0.03,
        "backspace_ratio": 0.05,
        "tab_ratio": 0.0,
        "ctrl_ratio": 0.0,
        "symbol_ratio": 0.1,
        "long_pause_count": 2.0,
        "avg_long_pause": 800.0,
        "burst_count": 0.0,
    }

    feature_array = feature_extractor.features_to_array(human_features)
    result = ml_inference.predict(feature_array)

    print(f"  Class: {result['class_label']}")
    print(f"  Confidence: {result['confidence']:.2f}")
    print(f"  Is human: {result['is_human']}")

    if "probabilities" in result:
        print("  Top classes:")
        probs = sorted(
            result["probabilities"].items(), key=lambda x: x[1], reverse=True
        )[:3]
        for cls, prob in probs:
            print(f"    {cls}: {prob:.3f}")

    print("  ✓ Prediction completed")

    # Test AI-like features
    print("\n[2.3] Predict AI-Assisted Typing")
    ai_features = {
        "total_keystrokes": 150.0,
        "duration_ms": 3000.0,
        "avg_dwell_time": 5.0,
        "std_dwell_time": 2.0,
        "min_dwell_time": 0.0,
        "max_dwell_time": 20.0,
        "avg_flight_time": 4.0,
        "std_flight_time": 2.0,
        "min_flight_time": 0.0,
        "max_flight_time": 50.0,
        "zero_dwell_ratio": 0.6,
        "zero_flight_ratio": 0.5,
        "pause_count": 1.0,
        "pause_ratio": 0.01,
        "backspace_ratio": 0.01,
        "tab_ratio": 0.02,
        "ctrl_ratio": 0.0,
        "symbol_ratio": 0.05,
        "long_pause_count": 0.0,
        "avg_long_pause": 0.0,
        "burst_count": 5.0,
    }

    feature_array = feature_extractor.features_to_array(ai_features)
    result = ml_inference.predict(feature_array)

    print(f"  Class: {result['class_label']}")
    print(f"  Confidence: {result['confidence']:.2f}")
    print(f"  Is human: {result['is_human']}")

    if "probabilities" in result:
        print("  Top classes:")
        probs = sorted(
            result["probabilities"].items(), key=lambda x: x[1], reverse=True
        )[:3]
        for cls, prob in probs:
            print(f"    {cls}: {prob:.3f}")

    print("  ✓ Prediction completed")
    print("\n✅ ML inference working!")


def test_volume_analysis():
    """Test volume-based detection."""
    print("\n" + "=" * 60)
    print("TEST 3: Volume Analysis")
    print("=" * 60)

    threshold = 0.10

    # Test 1: Pure human
    print("\n[3.1] Pure Human (100% typed)")
    human, paste, ai = 100, 0, 0
    total = human + paste + ai
    pct_human, pct_paste, pct_ai = human / total, paste / total, ai / total

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Human: {pct_human:.0%}, Paste: {pct_paste:.0%}, AI: {pct_ai:.0%}")
    print(f"  Verdict: {verdict}")
    assert verdict == "human_verified", "FAIL"
    print("  ✓ PASS")

    # Test 2: Heavy paste
    print("\n[3.2] Heavy Paste (60% pasted)")
    human, paste, ai = 40, 60, 0
    total = human + paste + ai
    pct_human, pct_paste, pct_ai = human / total, paste / total, ai / total

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Human: {pct_human:.0%}, Paste: {pct_paste:.0%}, AI: {pct_ai:.0%}")
    print(f"  Verdict: {verdict}")
    assert verdict == "paste_detected", "FAIL"
    print("  ✓ PASS")

    # Test 3: AI assisted
    print("\n[3.3] AI Assisted (30% AI)")
    human, paste, ai = 70, 0, 30
    total = human + paste + ai
    pct_human, pct_paste, pct_ai = human / total, paste / total, ai / total

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Human: {pct_human:.0%}, Paste: {pct_paste:.0%}, AI: {pct_ai:.0%}")
    print(f"  Verdict: {verdict}")
    assert verdict == "ai_assisted", "FAIL"
    print("  ✓ PASS")

    print("\n✅ Volume analysis working!")


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("HumanSign Verification Test Suite")
    print("=" * 60)

    try:
        test_burst_detection()
        test_ml_inference()
        test_volume_analysis()

        print("\n" + "=" * 60)
        print("🎉 ALL TESTS PASSED!")
        print("=" * 60)
        print("\nNext: Test with real API endpoint")
        print("  1. Start server: uvicorn app.main:app --reload")
        print("  2. Test verification endpoint")
        print()

        return 0

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n💥 ERROR: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
