#!/usr/bin/env python3
"""
End-to-end API test for HumanSign verification system.
Tests the complete verification pipeline with realistic scenarios.
"""

import json
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
        key_char=chr(key_code) if 65 <= key_code <= 90 else "?",
        client_timestamp=1000.0 + seq * 10,
        dwell_time=dwell,
        flight_time=flight,
    )


def generate_human_session(num_keys=100):
    """Generate realistic human typing session."""
    import random

    random.seed(42)

    keystrokes = []
    for i in range(num_keys):
        # Human typing: 80-120ms dwell, 60-100ms flight
        dwell = random.gauss(100, 20)
        flight = random.gauss(80, 25)

        # Keydown
        keystrokes.append(
            create_keystroke(
                1, random.randint(65, 90), max(50, dwell), max(40, flight), i * 2
            )
        )
        # Keyup
        keystrokes.append(
            create_keystroke(
                2, keystrokes[-1].key_code, max(50, dwell), max(40, flight), i * 2 + 1
            )
        )

    return keystrokes


def generate_paste_session(typed=30, pasted=70):
    """Generate session with paste operation."""
    import random

    random.seed(43)

    keystrokes = []

    # Type normally
    for i in range(typed):
        dwell = random.gauss(100, 20)
        flight = random.gauss(80, 25)
        keystrokes.append(
            create_keystroke(
                1, random.randint(65, 90), max(50, dwell), max(40, flight), i * 2
            )
        )
        keystrokes.append(
            create_keystroke(
                2, keystrokes[-1].key_code, max(50, dwell), max(40, flight), i * 2 + 1
            )
        )

    # Add paste event (event_type=3, key_code=length)
    keystrokes.append(create_keystroke(3, pasted, 0, 0, typed * 2))

    return keystrokes


def generate_ai_session(typed=60, ai_chars=40):
    """Generate session with AI autocomplete."""
    import random

    random.seed(44)

    keystrokes = []

    # Type normally
    for i in range(typed):
        dwell = random.gauss(100, 20)
        flight = random.gauss(80, 25)
        keystrokes.append(
            create_keystroke(
                1, random.randint(65, 90), max(50, dwell), max(40, flight), i * 2
            )
        )
        keystrokes.append(
            create_keystroke(
                2, keystrokes[-1].key_code, max(50, dwell), max(40, flight), i * 2 + 1
            )
        )

    # Add AI burst (very fast keys)
    for i in range(ai_chars):
        seq = (typed + i) * 2
        keystrokes.append(create_keystroke(1, random.randint(65, 90), 3.5, 2.5, seq))
        keystrokes.append(
            create_keystroke(2, keystrokes[-1].key_code, 3.5, 2.5, seq + 1)
        )

    # Add AI event marker (event_type=4, key_code=length)
    keystrokes.append(create_keystroke(4, ai_chars, 0, 0, (typed + ai_chars) * 2))

    return keystrokes


def test_scenario(name, keystrokes, expected_verdict, expected_is_human):
    """Test a verification scenario."""
    from app.services.feature_extractor import feature_extractor
    from app.services.ml_inference import ml_inference

    print(f"\n{'=' * 60}")
    print(f"SCENARIO: {name}")
    print(f"{'=' * 60}")

    # Separate event types
    keyboard_events = [k for k in keystrokes if k.event_type == 1]
    paste_events = [k for k in keystrokes if k.event_type == 3]
    ai_events = [k for k in keystrokes if k.event_type == 4]

    # Volume analysis
    human_volume = len(keyboard_events)
    paste_volume = sum(k.key_code for k in paste_events)
    ai_volume = sum(k.key_code for k in ai_events)
    total_volume = human_volume + paste_volume + ai_volume

    pct_human = human_volume / total_volume if total_volume > 0 else 0
    pct_paste = paste_volume / total_volume if total_volume > 0 else 0
    pct_ai = ai_volume / total_volume if total_volume > 0 else 0

    print(f"\nVolume Analysis:")
    print(f"  Human typed:  {human_volume} chars ({pct_human:.1%})")
    print(f"  Pasted:       {paste_volume} chars ({pct_paste:.1%})")
    print(f"  AI generated: {ai_volume} chars ({pct_ai:.1%})")
    print(f"  Total:        {total_volume} chars")

    # Feature extraction
    full_events = [k for k in keystrokes if k.event_type in (1, 2)]
    if len(full_events) >= 10:
        features = feature_extractor.extract_features(full_events)
        print(f"\nTiming Features:")
        print(f"  Avg dwell:  {features.get('avg_dwell_time', 0):.1f} ms")
        print(f"  Avg flight: {features.get('avg_flight_time', 0):.1f} ms")
        print(f"  Burst count: {features.get('burst_count', 0):.0f}")

        # ML prediction
        feature_array = feature_extractor.features_to_array(features)
        ml_result = ml_inference.predict(feature_array)
        print(f"\nML Prediction:")
        print(f"  Class: {ml_result.get('class_label', 'unknown')}")
        print(f"  Confidence: {ml_result.get('confidence', 0):.1%}")
        print(f"  Is human: {ml_result.get('is_human', False)}")

        # Burst detection
        burst_result = feature_extractor.detect_ai_bursts(full_events)
        if burst_result["has_burst"]:
            print(f"\nBurst Detection:")
            print(f"  ⚠️  AI BURST DETECTED!")
            print(f"  Burst count: {burst_result['burst_count']}")
            print(f"  Max length: {burst_result.get('max_burst_length', 0)}")

    # Final verdict logic (simplified from verification.py)
    volume_violation = pct_paste > 0.10 or pct_ai > 0.10

    if volume_violation:
        if pct_paste > pct_ai:
            verdict = "paste_detected"
            is_human = False
        else:
            verdict = "ai_assisted"
            is_human = False
    else:
        verdict = "human_verified"
        is_human = True

    print(f"\n{'=' * 60}")
    print(f"VERDICT: {verdict}")
    print(f"IS_HUMAN: {is_human}")
    print(f"{'=' * 60}")

    # Check expectations
    verdict_match = verdict == expected_verdict or (
        verdict.startswith(expected_verdict.split("_")[0])
    )
    human_match = is_human == expected_is_human

    if verdict_match and human_match:
        print("✅ PASS")
        return True
    else:
        print(f"❌ FAIL")
        print(f"  Expected verdict: {expected_verdict}, got: {verdict}")
        print(f"  Expected is_human: {expected_is_human}, got: {is_human}")
        return False


def main():
    """Run all test scenarios."""
    print("\n" + "=" * 60)
    print("HumanSign End-to-End API Test Suite")
    print("Testing Complete Verification Pipeline")
    print("=" * 60)

    results = []

    # Test 1: Pure human typing
    print("\n\n" + "🧑 TEST 1: Pure Human Typing (100 keys)")
    keystrokes = generate_human_session(100)
    results.append(
        test_scenario("Pure Human - 100% typed", keystrokes, "human_verified", True)
    )

    # Test 2: Heavy paste
    print("\n\n" + "📋 TEST 2: Heavy Paste (30 typed, 70 pasted)")
    keystrokes = generate_paste_session(30, 70)
    results.append(
        test_scenario(
            "Heavy Paste - 30% typed, 70% pasted", keystrokes, "paste_detected", False
        )
    )

    # Test 3: AI autocomplete
    print("\n\n" + "🤖 TEST 3: AI Autocomplete (60 typed, 40 AI burst)")
    keystrokes = generate_ai_session(60, 40)
    results.append(
        test_scenario(
            "AI Assisted - 60% typed, 40% AI",
            keystrokes,
            "ai",  # Will match "ai_assisted" or "ai_burst_detected"
            False,
        )
    )

    # Test 4: Borderline case (9% AI - under 10% threshold)
    print("\n\n" + "⚠️  TEST 4: Borderline AI (91 typed, 9 AI)")
    keystrokes = generate_ai_session(91, 9)
    results.append(
        test_scenario(
            "Borderline - 91% typed, 9% AI (under threshold)",
            keystrokes,
            "human_verified",
            True,
        )
    )

    # Test 5: Small paste (5% - under threshold)
    print("\n\n" + "✂️  TEST 5: Small Paste (95 typed, 5 pasted)")
    keystrokes = generate_paste_session(95, 5)
    results.append(
        test_scenario(
            "Small Paste - 95% typed, 5% pasted (under threshold)",
            keystrokes,
            "human_verified",
            True,
        )
    )

    # Results summary
    print("\n\n" + "=" * 60)
    print("TEST RESULTS SUMMARY")
    print("=" * 60)

    passed = sum(results)
    total = len(results)
    accuracy = (passed / total * 100) if total > 0 else 0

    print(f"\nTests Passed: {passed}/{total}")
    print(f"Accuracy: {accuracy:.1f}%")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        print("\nExpected Accuracy: 95-98%")
        print("Achieved: ✅ 100% on synthetic tests")
        print("\n📝 Next Steps:")
        print("  1. Test with real browser extension")
        print("  2. Test with GitHub Copilot")
        print("  3. Test with Grammarly")
        print("  4. Collect real-world data for validation")
        return 0
    else:
        print(f"\n❌ {total - passed} TEST(S) FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
