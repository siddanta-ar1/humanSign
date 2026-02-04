"""ML inference service using ONNX Runtime."""

import os
from typing import Any, Optional

import numpy as np
import onnxruntime as ort

from app.config import get_settings

# Multi-class labels
CLASSES = [
    "human_organic",
    "paste",
    "ai_assisted",
    "copy_paste_hybrid",
    "human_nonnative",
    "human_coding",
]


class MLInferenceService:
    """Service for running ONNX model inference."""

    def __init__(self):
        self._session: Optional[ort.InferenceSession] = None
        self._settings = get_settings()
        self._is_multiclass = False

    def _load_model(self) -> None:
        """Load ONNX model into memory."""
        model_path = self._settings.onnx_model_path

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")

        # Use optimized ONNX Runtime settings
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = (
            ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        )
        sess_options.intra_op_num_threads = 2

        self._session = ort.InferenceSession(
            model_path,
            sess_options,
            providers=["CPUExecutionProvider"],
        )

        # Detect if multi-class model (6 outputs vs 2)
        if len(self._session.get_outputs()) > 1:
            proba_shape = self._session.get_outputs()[1].shape
            if proba_shape and len(proba_shape) > 1 and proba_shape[1] == 6:
                self._is_multiclass = True

    @property
    def session(self) -> ort.InferenceSession:
        """Get or create inference session."""
        if self._session is None:
            self._load_model()
        return self._session  # type: ignore

    def predict(self, features: np.ndarray) -> dict[str, Any]:
        """
        Run prediction on feature array.

        Args:
            features: numpy array of shape (1, num_features)

        Returns:
            Dict with class_label, class_id, confidence, and all class probabilities
        """
        try:
            # Validate input shape
            if features.shape[0] != 1:
                raise ValueError(f"Expected batch size 1, got {features.shape[0]}")

            # Ensure model is loaded
            if self._session is None:
                self._load_model()

            input_name = self.session.get_inputs()[0].name
            expected_features = self.session.get_inputs()[0].shape[1]

            if features.shape[1] != expected_features:
                raise ValueError(
                    f"Feature mismatch: model expects {expected_features} features, got {features.shape[1]}"
                )

            outputs = self.session.run(None, {input_name: features})

            if self._is_multiclass:
                # Multi-class model
                class_id = int(outputs[0][0])
                probabilities = outputs[1][0]

                # Calculate total human probability (sum of human classes)
                # Human classes: 0 (organic), 4 (nonnative), 5 (coding)
                human_score = float(
                    probabilities[0] + probabilities[4] + probabilities[5]
                )

                return {
                    "class_id": class_id,
                    "class_label": CLASSES[class_id],
                    "confidence": float(probabilities[class_id]),
                    "prediction_score": human_score,
                    "probabilities": {
                        CLASSES[i]: float(p) for i, p in enumerate(probabilities)
                    },
                    "is_human": class_id in [0, 4, 5],  # organic, nonnative, coding
                }
            else:
                # Binary classification (backward compatibility)
                if len(outputs) > 1:
                    probabilities = outputs[1]
                    score = float(probabilities[0][1])
                else:
                    score = float(outputs[0][0])

                return {
                    "class_id": 0 if score >= 0.5 else 1,
                    "class_label": "human" if score >= 0.5 else "non_human",
                    "confidence": score if score >= 0.5 else (1 - score),
                    "prediction_score": score,
                    "is_human": score >= 0.5,
                }

        except Exception as e:
            print(f"[ERROR] ML inference failed: {e}")
            print(
                f"[ERROR] Feature shape: {features.shape if features is not None else 'None'}"
            )
            print(f"[ERROR] Model loaded: {self._session is not None}")
            import traceback

            traceback.print_exc()

            return {
                "class_id": -1,
                "class_label": "error",
                "confidence": 0.0,
                "is_human": False,
                "error": str(e),
            }

    def is_model_loaded(self) -> bool:
        """Check if model is loaded and ready."""
        return self._session is not None

    def is_multiclass(self) -> bool:
        """Check if loaded model is multi-class."""
        return self._is_multiclass

    def warmup(self) -> None:
        """Warm up the model with a dummy prediction."""
        try:
            # Load model first to detect multiclass
            if self._session is None:
                self._load_model()

            # Get actual input shape from model
            input_shape = self.session.get_inputs()[0].shape
            num_features = input_shape[1] if len(input_shape) > 1 else 21

            print(f"[INFO] Warming up ML model with {num_features} features")
            dummy_features = np.zeros((1, num_features), dtype=np.float32)
            result = self.predict(dummy_features)
            print(f"[INFO] Warmup result: {result.get('class_label', 'unknown')}")
        except Exception as e:
            print(f"[WARNING] Model warmup failed: {e}")
            import traceback

            traceback.print_exc()


# Singleton instance
ml_inference = MLInferenceService()
