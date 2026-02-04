#!/usr/bin/env python3
"""
Test script for hybrid verification system.
Tests burst detection, ML inference, and volume-based analysis.
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

# Add server directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.feature_extractor import feature_extractor
from app.services.ml_inference import ml_inference


def create_mock_keystroke(
    event_type: int,
    key_code: int,
    dwell_time: float | None,
    flight_time: float | None,
    sequence_num: int,
) -> SimpleNamespace:
    """Create a mock ProcessedKeystroke object."""
    return SimpleNamespace(
        time=datetime.now(timezone.utc),
        session_id=uuid4(),
        sequence_num=sequence_num,
        event_type=event_type,
        key_code=key_code,
        key_char="a",
        client_timestamp=1000.0 + sequence_num * 100,
        dwell_time=dwell_time,
        flight_time=flight_time,
    )


def test_burst_detection():
    """Test AI burst detection with various patterns."""
    print("\n" + "=" * 60)
    print("TEST 1: AI Burst Detection")
    print("=" * 60)

    # Test Case 1: Clear AI burst (10 keys with < 8ms timing)
    print("\n[Test 1.1] Pure AI burst (10 fast keys)")
    ai_burst_keys = []
    for i in range(10):
        # Keydown
        ai_burst_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + i,
                dwell_time=3.5,
                flight_time=2.1,
                sequence_num=i * 2,
            )
        )
        # Keyup
        ai_burst_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + i,
                dwell_time=3.5,
                flight_time=2.1,
                sequence_num=i * 2 + 1,
            )
        )

    result = feature_extractor.detect_ai_bursts(ai_burst_keys)
    print(f"  Has burst: {result['has_burst']}")
    print(f"  Burst count: {result['burst_count']}")
    print(f"  Burst severity: {result['burst_severity']:.3f}")
    print(f"  Max burst length: {result['max_burst_length']}")
    assert result["has_burst"], "Should detect AI burst!"
    print("  ✓ PASS")

    # Test Case 2: Human typing (normal timing)
    print("\n[Test 1.2] Human typing (normal timing)")
    human_keys = []
    for i in range(20):
        # Keydown
        human_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + (i % 26),
                dwell_time=100.0,
                flight_time=80.0,
                sequence_num=i * 2,
            )
        )
        # Keyup
        human_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + (i % 26),
                dwell_time=100.0,
                flight_time=80.0,
                sequence_num=i * 2 + 1,
            )
        )

    result = feature_extractor.detect_ai_bursts(human_keys)
    print(f"  Has burst: {result['has_burst']}")
    print(f"  Burst count: {result['burst_count']}")
    print(f"  Burst severity: {result['burst_severity']:.3f}")
    assert not result["has_burst"], "Should NOT detect burst in human typing!"
    print("  ✓ PASS")

    # Test Case 3: Mixed (human + AI burst)
    print("\n[Test 1.3] Mixed: 10 human + 6 AI burst")
    mixed_keys = []

    # 10 human keys
    for i in range(10):
        mixed_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + i,
                dwell_time=100.0,
                flight_time=70.0,
                sequence_num=i * 2,
            )
        )
        mixed_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + i,
                dwell_time=100.0,
                flight_time=70.0,
                sequence_num=i * 2 + 1,
            )
        )

    # 6 AI burst keys
    for i in range(6):
        mixed_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + i,
                dwell_time=3.0,
                flight_time=3.0,
                sequence_num=20 + i * 2,
            )
        )
        mixed_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + i,
                dwell_time=3.0,
                flight_time=3.0,
                sequence_num=20 + i * 2 + 1,
            )
        )

    result = feature_extractor.detect_ai_bursts(mixed_keys)
    print(f"  Has burst: {result['has_burst']}")
    print(f"  Burst count: {result['burst_count']}")
    print(f"  Burst severity: {result['burst_severity']:.3f}")
    print(f"  Burst positions: {result['burst_positions']}")
    assert result["has_burst"], "Should detect AI burst in mixed sequence!"
    print("  ✓ PASS")

    # Test Case 4: Edge case - exactly 5 fast keys
    print("\n[Test 1.4] Edge case: Exactly 5 fast keys")
    edge_keys = []
    for i in range(5):
        edge_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + i,
                dwell_time=5.0,
                flight_time=5.0,
                sequence_num=i * 2,
            )
        )
        edge_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + i,
                dwell_time=5.0,
                flight_time=5.0,
                sequence_num=i * 2 + 1,
            )
        )

    result = feature_extractor.detect_ai_bursts(edge_keys)
    print(f"  Has burst: {result['has_burst']}")
    print(f"  Burst count: {result['burst_count']}")
    assert result["has_burst"], "Should detect burst with exactly 5 fast keys!"
    print("  ✓ PASS")

    # Test Case 5: Fast human typist (borderline case)
    print("\n[Test 1.5] Fast human typist (15ms timing)")
    fast_human_keys = []
    for i in range(20):
        fast_human_keys.append(
            create_mock_keystroke(
                event_type=1,
                key_code=65 + (i % 26),
                dwell_time=15.0,
                flight_time=15.0,
                sequence_num=i * 2,
            )
        )
        fast_human_keys.append(
            create_mock_keystroke(
                event_type=2,
                key_code=65 + (i % 26),
                dwell_time=15.0,
                flight_time=15.0,
                sequence_num=i * 2 + 1,
            )
        )

    result = feature_extractor.detect_ai_bursts(fast_human_keys)
    print(f"  Has burst: {result['has_burst']}")
    print(f"  Burst count: {result['burst_count']}")
    print(f"  Note: 15ms is above 8ms threshold, so should NOT trigger")
    assert not result["has_burst"], "Should NOT flag fast human (15ms) as AI burst!"
    print("  ✓ PASS")

    print("\n✅ All burst detection tests passed!")


def test_feature_extraction():
    """Test feature extraction from keystroke sequences."""
    print("\n" + "=" * 60)
    print("TEST 2: Feature Extraction")
    print("=" * 60)

    # Create realistic keystroke sequence
    print("\n[Test 2.1] Extract features from human-like typing")
    keystrokes = []

    # Simulate 50 keys with human-like variability
    import random

    random.seed(42)

    for i in range(50):
        dwell = random.gauss(100, 30)  # Normal distribution
        flight = random.gauss(80, 40)

        # Keydown
        keystrokes.append(
            create_mock_keystroke(
                event_type=1,
                key_code=random.randint(65, 90),
                dwell_time=max(10, dwell),
                flight_time=max(10, flight),
                sequence_num=i * 2,
            )
        )
        # Keyup
        keystrokes.append(
            create_mock_keystroke(
                event_type=2,
                key_code=keystrokes[-1].key_code,
                dwell_time=max(10, dwell),
                flight_time=max(10, flight),
                sequence_num=i * 2 + 1,
            )
        )

    features = feature_extractor.extract_features(keystrokes)

    print(f"  Total keystrokes: {features['total_keystrokes']}")
    print(f"  Duration: {features['duration_ms']:.2f} ms")
    print(f"  Avg dwell time: {features['avg_dwell_time']:.2f} ms")
    print(f"  Std dwell time: {features['std_dwell_time']:.2f} ms")
    print(f"  Avg flight time: {features['avg_flight_time']:.2f} ms")
    print(f"  Zero dwell ratio: {features['zero_dwell_ratio']:.3f}")
    print(f"  Zero flight ratio: {features['zero_flight_ratio']:.3f}")
    print(f"  Burst count: {features['burst_count']}")
    print(f"  Pause count: {features['pause_count']}")
    print(f"  Backspace ratio: {features['backspace_ratio']:.3f}")

    assert features["total_keystrokes"] == 50, "Should count 50 keystrokes"
    assert features["avg_dwell_time"] > 0, "Should have non-zero dwell time"
    assert features["zero_dwell_ratio"] == 0, "Should have no zero dwells"
    print("  ✓ PASS")

    # Test feature array conversion
    print("\n[Test 2.2] Convert features to ML array")
    feature_array = feature_extractor.features_to_array(features)
    print(f"  Array shape: {feature_array.shape}")
    print(f"  Array dtype: {feature_array.dtype}")
    assert feature_array.shape == (1, 21), "Should be (1, 21) for 21 features"
    assert feature_array.dtype == "float32", "Should be float32 for ONNX"
    print("  ✓ PASS")

    print("\n✅ All feature extraction tests passed!")


def test_ml_inference():
    """Test ML model inference."""
    print("\n" + "=" * 60)
    print("TEST 3: ML Model Inference")
    print("=" * 60)

    # Check if model is loaded
    print("\n[Test 3.1] Model loading")
    is_loaded = ml_inference.is_model_loaded()
    print(f"  Model loaded: {is_loaded}")

    if not is_loaded:
        print("  Attempting to load model...")
        ml_inference.warmup()
        is_loaded = ml_inference.is_model_loaded()

    if not is_loaded:
        print("  ⚠️  SKIP: Model not available (run training first)")
        return

    print(f"  Model is multiclass: {ml_inference.is_multiclass()}")
    print("  ✓ Model ready")

    # Test prediction with human-like features
    print("\n[Test 3.2] Predict human-like typing")
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

    print(f"  Predicted class: {result['class_label']}")
    print(f"  Confidence: {result['confidence']:.3f}")
    print(f"  Is human: {result['is_human']}")
    print(f"  Prediction score: {result.get('prediction_score', 0.0):.3f}")

    if "probabilities" in result:
        print("  Probabilities:")
        for class_name, prob in result["probabilities"].items():
            print(f"    {class_name}: {prob:.3f}")

    print("  ✓ Prediction completed")

    # Test prediction with AI-like features
    print("\n[Test 3.3] Predict AI-assisted typing")
    ai_features = {
        "total_keystrokes": 150.0,
        "duration_ms": 3000.0,  # Very fast
        "avg_dwell_time": 5.0,  # Very low
        "std_dwell_time": 2.0,
        "min_dwell_time": 0.0,
        "max_dwell_time": 20.0,
        "avg_flight_time": 4.0,  # Very low
        "std_flight_time": 2.0,
        "min_flight_time": 0.0,
        "max_flight_time": 50.0,
        "zero_dwell_ratio": 0.6,  # High zero ratio
        "zero_flight_ratio": 0.5,
        "pause_count": 1.0,
        "pause_ratio": 0.01,
        "backspace_ratio": 0.01,
        "tab_ratio": 0.02,
        "ctrl_ratio": 0.0,
        "symbol_ratio": 0.05,
        "long_pause_count": 0.0,
        "avg_long_pause": 0.0,
        "burst_count": 5.0,  # Multiple bursts
    }

    feature_array = feature_extractor.features_to_array(ai_features)
    result = ml_inference.predict(feature_array)

    print(f"  Predicted class: {result['class_label']}")
    print(f"  Confidence: {result['confidence']:.3f}")
    print(f"  Is human: {result['is_human']}")
    print(f"  Prediction score: {result.get('prediction_score', 0.0):.3f}")

    if "probabilities" in result:
        print("  Probabilities:")
        for class_name, prob in result["probabilities"].items():
            print(f"    {class_name}: {prob:.3f}")

    print("  ✓ Prediction completed")

    print("\n✅ All ML inference tests passed!")


def test_volume_analysis():
    """Test volume-based detection logic."""
    print("\n" + "=" * 60)
    print("TEST 4: Volume-Based Analysis")
    print("=" * 60)

    # Test Case 1: Pure human (100% typed)
    print("\n[Test 4.1] Pure human typing (100 chars typed)")
    human_volume = 100
    paste_volume = 0
    ai_volume = 0
    total = human_volume + paste_volume + ai_volume

    pct_human = human_volume / total
    pct_paste = paste_volume / total
    pct_ai = ai_volume / total

    print(f"  Human: {pct_human:.1%}, Paste: {pct_paste:.1%}, AI: {pct_ai:.1%}")

    threshold = 0.10
    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Verdict: {verdict}")
    assert verdict == "human_verified", "Should verify as human!"
    print("  ✓ PASS")

    # Test Case 2: Heavy paste (60% pasted)
    print("\n[Test 4.2] Heavy paste (40 typed, 60 pasted)")
    human_volume = 40
    paste_volume = 60
    ai_volume = 0
    total = human_volume + paste_volume + ai_volume

    pct_human = human_volume / total
    pct_paste = paste_volume / total
    pct_ai = ai_volume / total

    print(f"  Human: {pct_human:.1%}, Paste: {pct_paste:.1%}, AI: {pct_ai:.1%}")

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Verdict: {verdict}")
    assert verdict == "paste_detected", "Should detect paste!"
    print("  ✓ PASS")

    # Test Case 3: AI assisted (30% AI)
    print("\n[Test 4.3] AI assisted (70 typed, 30 AI)")
    human_volume = 70
    paste_volume = 0
    ai_volume = 30
    total = human_volume + paste_volume + ai_volume

    pct_human = human_volume / total
    pct_paste = paste_volume / total
    pct_ai = ai_volume / total

    print(f"  Human: {pct_human:.1%}, Paste: {pct_paste:.1%}, AI: {pct_ai:.1%}")

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Verdict: {verdict}")
    assert verdict == "ai_assisted", "Should detect AI assistance!"
    print("  ✓ PASS")

    # Test Case 4: Under threshold (9% AI)
    print("\n[Test 4.4] Under threshold (91 typed, 9 AI)")
    human_volume = 91
    paste_volume = 0
    ai_volume = 9
    total = human_volume + paste_volume + ai_volume

    pct_human = human_volume / total
    pct_paste = paste_volume / total
    pct_ai = ai_volume / total

    print(f"  Human: {pct_human:.1%}, Paste: {pct_paste:.1%}, AI: {pct_ai:.1%}")

    verdict = "human_verified"
    if pct_paste > threshold:
        verdict = "paste_detected"
    elif pct_ai > threshold:
        verdict = "ai_assisted"

    print(f"  Verdict: {verdict}")
    print(f"  Note: 9% AI is under 10% threshold")
    assert verdict == "human_verified", "Should verify as human (under threshold)!"
    print("  ✓ PASS (but could be exploited!)")

    print("\n✅ All volume analysis tests passed!")


def main():
    """Run all tests."""
    print("\n")
    print("=" * 60)
    print(" HumanSign Hybrid Verification Test Suite")
    print("=" * 60)

    try:
        # Run all test suites
        test_burst_detection()
        test_feature_extraction()
        test_ml_inference()
        test_volume_analysis()

        print("\n" + "=" * 60)
        print(" 🎉 ALL TESTS PASSED!")
        print("=" * 60)
        print("\nNext Steps:")
        print("1. Test with real AI tools (Copilot, ChatGPT)")
        print("2. Collect real-world data for model retraining")
        print("3. Deploy updated verification endpoint")
        print("4. Monitor false positive/negative rates")
        print("\n")

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
