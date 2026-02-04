"""
Export Multi-Class XGBoost Model to ONNX

Converts the trained 6-class keystroke model to ONNX format
for fast inference in the backend server.
"""

import argparse
from pathlib import Path
import json

import numpy as np
import joblib
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType
import onnx
import onnxruntime as ort


# Must match train_multiclass.py
NUM_FEATURES = 21
CLASSES = [
    'human_organic',
    'paste',
    'ai_assisted',
    'copy_paste_hybrid',
    'human_nonnative',
    'human_coding',
]


def export_to_onnx(
    model_path: Path,
    output_path: Path,
) -> None:
    """Export XGBoost model to ONNX."""
    
    print(f"Loading model: {model_path}")
    model = joblib.load(model_path)
    
    # Define input shape
    initial_type = [('float_input', FloatTensorType([None, NUM_FEATURES]))]
    
    print(f"Converting to ONNX (features: {NUM_FEATURES}, classes: {len(CLASSES)})...")
    
    # Use onnxmltools which properly handles XGBoost
    onnx_model = convert_xgboost(
        model,
        initial_types=initial_type,
        target_opset=12,
    )
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save_model(onnx_model, str(output_path))
    print(f"ONNX model saved: {output_path}")
    
    # Validate
    validate_onnx(output_path, model)


def validate_onnx(onnx_path: Path, original_model) -> None:
    """Validate ONNX model against original."""
    
    print("\n" + "=" * 50)
    print("Validating ONNX Model")
    print("=" * 50)
    
    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name
    
    # Test input
    np.random.seed(42)
    test_input = np.random.rand(10, NUM_FEATURES).astype(np.float32)
    
    # Original predictions
    original_pred = original_model.predict(test_input)
    original_proba = original_model.predict_proba(test_input)
    
    # ONNX predictions
    onnx_outputs = session.run(None, {input_name: test_input})
    onnx_pred = onnx_outputs[0]
    onnx_proba = onnx_outputs[1]
    
    # Compare
    pred_match = np.all(original_pred == onnx_pred)
    proba_diff = np.max(np.abs(original_proba - onnx_proba))
    
    print(f"Predictions match: {pred_match}")
    print(f"Max probability difference: {proba_diff:.6f}")
    
    print("\nSAMPLE OUTPUTS (First row):")
    print(f"Original Proba: {original_proba[0]}")
    print(f"ONNX Proba:     {onnx_proba[0]}")
    print(f"ONNX Range:     Min={np.min(onnx_proba):.4f}, Max={np.max(onnx_proba):.4f}")
    
    if pred_match and proba_diff < 0.01:
        print("✓ ONNX validation passed!")
    else:
        print("⚠ Warning: ONNX outputs differ from original")
    
    # Model info
    print(f"\nModel Info:")
    print(f"  Input: {input_name} shape={session.get_inputs()[0].shape}")
    for i, out in enumerate(session.get_outputs()):
        print(f"  Output {i}: {out.name} shape={out.shape}")


def benchmark(onnx_path: Path, n_iterations: int = 1000) -> None:
    """Benchmark inference speed."""
    import time
    
    print("\n" + "=" * 50)
    print(f"Inference Benchmark ({n_iterations} iterations)")
    print("=" * 50)
    
    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name
    
    test_input = np.random.rand(1, NUM_FEATURES).astype(np.float32)
    
    # Warmup
    for _ in range(10):
        session.run(None, {input_name: test_input})
    
    # Benchmark
    start = time.perf_counter()
    for _ in range(n_iterations):
        session.run(None, {input_name: test_input})
    elapsed = time.perf_counter() - start
    
    avg_ms = (elapsed / n_iterations) * 1000
    throughput = n_iterations / elapsed
    
    print(f"Average latency: {avg_ms:.3f} ms")
    print(f"Throughput: {throughput:.0f} predictions/sec")


def main():
    parser = argparse.ArgumentParser(description='Export multi-class model to ONNX')
    parser.add_argument('--model', type=Path, default=Path('models/keystroke_multiclass.joblib'),
                        help='Path to trained model')
    parser.add_argument('--output', type=Path, default=Path('models/keystroke_multiclass.onnx'),
                        help='ONNX output path')
    parser.add_argument('--benchmark', action='store_true',
                        help='Run inference benchmark')
    args = parser.parse_args()
    
    print("=" * 50)
    print("HumanSign ONNX Export (Multi-Class)")
    print("=" * 50)
    
    if not args.model.exists():
        print(f"\nModel not found: {args.model}")
        print("Run 'python train_multiclass.py' first")
        return
    
    export_to_onnx(args.model, args.output)
    
    if args.benchmark:
        benchmark(args.output)
    
    print("\n" + "=" * 50)
    print("Export Complete!")
    print("=" * 50)


if __name__ == '__main__':
    main()
