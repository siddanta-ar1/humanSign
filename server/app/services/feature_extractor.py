"""Feature extraction service for ML pipeline."""

import json
from typing import Any

import numpy as np

from app.models import ProcessedKeystroke

# Features expected by the specific ML model (MUST match train_multiclass.py)
MODEL_FEATURES = [
    "total_keystrokes",
    "duration_ms",
    "avg_dwell_time",
    "std_dwell_time",
    "min_dwell_time",
    "max_dwell_time",
    "avg_flight_time",
    "std_flight_time",
    "min_flight_time",
    "max_flight_time",
    "zero_dwell_ratio",
    "zero_flight_ratio",
    "pause_count",
    "pause_ratio",
    "backspace_ratio",
    "tab_ratio",
    "ctrl_ratio",
    "symbol_ratio",
    "long_pause_count",
    "avg_long_pause",
    "burst_count",
]


class FeatureExtractor:
    """Extract ML features from keystroke data."""

    def extract_features(
        self,
        keystrokes: list[ProcessedKeystroke],
    ) -> dict[str, Any]:
        """
        Extract comprehensive features from a session's keystrokes.

        Returns a dictionary of features suitable for ML model input.
        """
        if not keystrokes:
            return self._empty_features()

        # Filter to valid events
        # We need lists of values for vectorized ops
        dwells_all = np.array(
            [k.dwell_time for k in keystrokes if k.dwell_time is not None]
        )
        flights_all = np.array(
            [k.flight_time for k in keystrokes if k.flight_time is not None]
        )
        key_codes = np.array(
            [k.key_code for k in keystrokes if k.event_type == 1]
        )  # Keydowns only for codes

        # 1. Total Keystrokes
        total_keystrokes = len(dwells_all)

        # 2. Duration (Sum of dwells + flights)
        # Note: Handling edge cases where lists might be different lengths (though usually matched)
        duration_ms = float(np.sum(dwells_all) + np.sum(flights_all))

        features: dict[str, Any] = {
            "total_keystrokes": float(total_keystrokes),
            "duration_ms": duration_ms,
        }

        # Filter for stats ( > 0 )
        dwells_pos = dwells_all[dwells_all > 0]
        flights_pos = flights_all[flights_all > 0]

        # Dwell Statistics
        if len(dwells_pos) > 0:
            features.update(
                {
                    "avg_dwell_time": float(np.mean(dwells_pos)),
                    "std_dwell_time": float(np.std(dwells_pos)),
                    "min_dwell_time": float(np.min(dwells_pos)),
                    "max_dwell_time": float(np.max(dwells_pos)),
                }
            )
        else:
            features.update(
                {
                    "avg_dwell_time": 0.0,
                    "std_dwell_time": 0.0,
                    "min_dwell_time": 0.0,
                    "max_dwell_time": 0.0,
                }
            )

        # Flight Statistics
        if len(flights_pos) > 0:
            features.update(
                {
                    "avg_flight_time": float(np.mean(flights_pos)),
                    "std_flight_time": float(np.std(flights_pos)),
                    "min_flight_time": float(np.min(flights_pos)),
                    "max_flight_time": float(np.max(flights_pos)),
                }
            )
        else:
            features.update(
                {
                    "avg_flight_time": 0.0,
                    "std_flight_time": 0.0,
                    "min_flight_time": 0.0,
                    "max_flight_time": 0.0,
                }
            )

        # Zero Ratios
        features["zero_dwell_ratio"] = (
            float(np.mean(dwells_all == 0)) if len(dwells_all) > 0 else 0.0
        )
        features["zero_flight_ratio"] = (
            float(np.mean(flights_all == 0)) if len(flights_all) > 0 else 0.0
        )

        # Pauses (> 500ms)
        # Note: Based on generate_synthetic.py logic where typically pauses are inserted > 500ms
        pause_mask = flights_all > 500
        pause_count = int(np.sum(pause_mask))
        features["pause_count"] = float(pause_count)
        features["pause_ratio"] = (
            float(pause_count / len(flights_all)) if len(flights_all) > 0 else 0.0
        )

        # Long Pauses (Using same > 500ms definition as generate_synthetic default for long_pauses)
        long_pauses = flights_all[pause_mask]
        features["long_pause_count"] = float(len(long_pauses))
        features["avg_long_pause"] = (
            float(np.mean(long_pauses)) if len(long_pauses) > 0 else 0.0
        )

        # Key Ratios
        if len(key_codes) > 0:
            features["backspace_ratio"] = float(np.mean(key_codes == 8))
            features["tab_ratio"] = float(np.mean(key_codes == 9))
            features["ctrl_ratio"] = float(np.mean(key_codes == 17))

            # Symbol Ratio: (keys >= 33 and <= 47) or (keys >= 58 and <= 64)
            # Replicating logic from generate_synthetic.py exactly (even if it misses some symbols)
            symbol_mask = ((key_codes >= 33) & (key_codes <= 47)) | (
                (key_codes >= 58) & (key_codes <= 64)
            )
            features["symbol_ratio"] = float(np.mean(symbol_mask))

            # Alias for UI/API backward compatibility
            features["error_rate"] = features["backspace_ratio"]
        else:
            features["backspace_ratio"] = 0.0
            features["tab_ratio"] = 0.0
            features["ctrl_ratio"] = 0.0
            features["symbol_ratio"] = 0.0
            features["error_rate"] = 0.0

        # Burst Count (flights < 50ms)
        features["burst_count"] = self._compute_bursts(flights_all)

        # Extra metrics (Not used in model, but good for UI)
        features["avg_wpm"] = self._compute_wpm(len(key_codes), duration_ms)

        return features

    def _compute_bursts(self, flight_times: np.ndarray) -> float:
        """Compute number of burst sequences (consecutive fast typing)."""
        if len(flight_times) == 0:
            return 0.0

        fast_mask = flight_times < 50
        burst_count = 0
        in_burst = False

        for is_fast in fast_mask:
            if is_fast and not in_burst:
                burst_count += 1
                in_burst = True
            elif not is_fast:
                in_burst = False

        return float(burst_count)

    def _compute_wpm(self, char_count: int, duration_ms: float) -> float:
        """Compute words per minute (assuming 5 chars = 1 word)."""
        if duration_ms <= 0:
            return 0.0
        words = char_count / 5.0
        minutes = duration_ms / 60000.0
        return words / max(minutes, 0.001)

    def detect_ai_bursts(self, keystrokes: list[ProcessedKeystroke]) -> dict[str, Any]:
        """
        Detect sequences of consecutive keys with extremely fast timing.
        AI signature: dwell < 5ms AND flight < 5ms for 8+ consecutive keys.

        Human fast typing: 10-15ms (150-200 WPM)
        AI synthesis: 3-5ms (impossible for humans)

        Returns:
            Dictionary with burst detection results including:
            - has_burst: bool indicating if AI burst detected
            - burst_count: number of burst sequences found
            - burst_positions: list of indices where bursts start
            - burst_severity: ratio of burst keys to total keys
            - max_burst_length: longest burst sequence
        """
        if len(keystrokes) < 8:
            return {
                "has_burst": False,
                "burst_count": 0,
                "burst_positions": [],
                "burst_severity": 0.0,
                "max_burst_length": 0,
            }

        consecutive_fast = 0
        burst_positions = []
        current_burst_start = -1
        max_burst_length = 0

        for i, k in enumerate(keystrokes):
            dwell = k.dwell_time if k.dwell_time is not None else 999.0
            flight = k.flight_time if k.flight_time is not None else 999.0

            # AI signature: both dwell AND flight extremely fast
            # Threshold: 5ms (human fast typing is typically 10-15ms minimum)
            if dwell < 5.0 and flight < 5.0:
                if consecutive_fast == 0:
                    current_burst_start = i
                consecutive_fast += 1

                # Mark as burst if we reach 8 consecutive fast keys
                # Increased from 5 to avoid false positives on fast human typing
                if consecutive_fast == 8 and current_burst_start not in burst_positions:
                    burst_positions.append(current_burst_start)
            else:
                # Burst broken - record length and reset
                if consecutive_fast > 0:
                    max_burst_length = max(max_burst_length, consecutive_fast)
                consecutive_fast = 0
                current_burst_start = -1

        # Check final sequence
        if consecutive_fast > 0:
            max_burst_length = max(max_burst_length, consecutive_fast)

        total_keys = len(keystrokes)
        burst_severity = len(burst_positions) / total_keys if total_keys > 0 else 0.0

        return {
            "has_burst": len(burst_positions) > 0,
            "burst_count": len(burst_positions),
            "burst_positions": burst_positions,
            "burst_severity": burst_severity,
            "max_burst_length": max_burst_length,
        }

    def _empty_features(self) -> dict[str, Any]:
        """Return empty features dict."""
        return {feat: 0.0 for feat in MODEL_FEATURES + ["avg_wpm", "error_rate"]}

    def features_to_array(self, features: dict[str, Any]) -> np.ndarray:
        """Convert features dict to numpy array for model input."""
        # STRICT ORDER enforcement
        row = [features.get(col, 0.0) for col in MODEL_FEATURES]
        return np.array([row], dtype=np.float32)


# Singleton instance
feature_extractor = FeatureExtractor()
