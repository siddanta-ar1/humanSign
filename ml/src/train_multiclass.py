"""
Multi-Class XGBoost Training for Keystroke Classification

Trains a 6-class model to distinguish:
1. human_organic - Natural typing
2. paste - Bulk text insertion
3. ai_assisted - AI autocomplete acceptance
4. copy_paste_hybrid - Mixed behavior
5. human_nonnative - Non-native speaker
6. human_coding - Programming patterns
"""

import argparse
import json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
import joblib


# Feature columns (must match generate_synthetic.py output)
FEATURE_COLUMNS = [
    'total_keystrokes',
    'duration_ms',
    'avg_dwell_time',
    'std_dwell_time',
    'min_dwell_time',
    'max_dwell_time',
    'avg_flight_time',
    'std_flight_time',
    'min_flight_time',
    'max_flight_time',
    'zero_dwell_ratio',
    'zero_flight_ratio',
    'pause_count',
    'pause_ratio',
    'backspace_ratio',
    'tab_ratio',
    'ctrl_ratio',
    'symbol_ratio',
    'long_pause_count',
    'avg_long_pause',
    'burst_count',
]

# Class names
CLASSES = [
    'human_organic',
    'paste',
    'ai_assisted',
    'copy_paste_hybrid',
    'human_nonnative',
    'human_coding',
]


def load_data(data_path: Path) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Load and prepare training data."""
    df = pd.read_csv(data_path)
    
    # Ensure all feature columns exist
    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    
    X = df[FEATURE_COLUMNS].values.astype(np.float32)
    y = df['label_id'].values.astype(np.int32)
    
    return df, X, y


def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    num_classes: int = 6,
) -> xgb.XGBClassifier:
    """Train multi-class XGBoost model."""
    
    model = xgb.XGBClassifier(
        objective='multi:softmax',
        num_class=num_classes,
        eval_metric='mlogloss',
        max_depth=6,
        learning_rate=0.1,
        n_estimators=200,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        use_label_encoder=False,
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=True,
    )
    
    return model


def evaluate_model(
    model: xgb.XGBClassifier,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> dict:
    """Evaluate model on test set."""
    y_pred = model.predict(X_test)
    
    accuracy = accuracy_score(y_test, y_pred)
    
    print("\n" + "=" * 60)
    print("TEST SET EVALUATION")
    print("=" * 60)
    print(f"\nAccuracy: {accuracy:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=CLASSES))
    
    print("\nConfusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(pd.DataFrame(cm, index=CLASSES, columns=CLASSES))
    
    return {
        'accuracy': accuracy,
        'classification_report': classification_report(y_test, y_pred, target_names=CLASSES, output_dict=True),
    }


def save_model(
    model: xgb.XGBClassifier,
    output_dir: Path,
    metrics: dict,
) -> None:
    """Save trained model and metadata."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save XGBoost native format
    xgb_path = output_dir / 'keystroke_multiclass.json'
    model.save_model(xgb_path)
    print(f"\nXGBoost model saved: {xgb_path}")
    
    # Save sklearn wrapper for ONNX export
    joblib_path = output_dir / 'keystroke_multiclass.joblib'
    joblib.dump(model, joblib_path)
    print(f"Joblib model saved: {joblib_path}")
    
    # Save metadata
    metadata = {
        'timestamp': datetime.now().isoformat(),
        'num_classes': len(CLASSES),
        'classes': CLASSES,
        'features': FEATURE_COLUMNS,
        'num_features': len(FEATURE_COLUMNS),
        'metrics': {
            'accuracy': metrics['accuracy'],
        },
    }
    
    meta_path = output_dir / 'model_metadata.json'
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved: {meta_path}")


def main():
    parser = argparse.ArgumentParser(description='Train multi-class keystroke model')
    parser.add_argument('--data', type=Path, default=Path('data/synthetic_multiclass.csv'),
                        help='Path to training data CSV')
    parser.add_argument('--output-dir', type=Path, default=Path('models'),
                        help='Output directory for model')
    parser.add_argument('--test-size', type=float, default=0.15,
                        help='Test set proportion')
    parser.add_argument('--val-size', type=float, default=0.15,
                        help='Validation set proportion')
    args = parser.parse_args()
    
    print("=" * 60)
    print("HumanSign Multi-Class Model Training")
    print("=" * 60)
    
    # Check data exists
    if not args.data.exists():
        print(f"\nData file not found: {args.data}")
        print("Run 'python generate_synthetic.py' first to create training data")
        return
    
    # Load data
    print(f"\nLoading data from: {args.data}")
    df, X, y = load_data(args.data)
    
    print(f"Total samples: {len(df)}")
    print(f"Features: {len(FEATURE_COLUMNS)}")
    print(f"\nClass distribution:")
    print(df['label'].value_counts())
    
    # Split data
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42, stratify=y
    )
    
    val_ratio = args.val_size / (1 - args.test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=val_ratio, random_state=42, stratify=y_temp
    )
    
    print(f"\nData split: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")
    
    # Train
    print("\n" + "=" * 60)
    print("Training XGBoost Multi-Class Model")
    print("=" * 60)
    
    model = train_model(X_train, y_train, X_val, y_val)
    
    # Evaluate
    metrics = evaluate_model(model, X_test, y_test)
    
    # Save
    save_model(model, args.output_dir, metrics)
    
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print(f"\nNext: Run 'python export_multiclass_onnx.py' to export ONNX model")


if __name__ == '__main__':
    main()
