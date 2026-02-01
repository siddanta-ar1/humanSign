"""
Real Dataset Loader for HumanSign

Downloads and processes:
- DS-01 Aalto Desktop (136M keystrokes)
- DS-12 Liveness Detection (Human vs Synthetic)

Usage:
    python load_real_datasets.py --download-aalto --download-liveness
    python load_real_datasets.py --process-only
"""

import argparse
import os
import zipfile
import subprocess
from pathlib import Path
from typing import Optional
import shutil

import numpy as np
import pandas as pd


# Dataset URLs
AALTO_URL = "http://userinterfaces.aalto.fi/136Mkeystrokes/data/Keystrokes.zip"
LIVENESS_URL = "https://data.mendeley.com/public-files/datasets/mzm86rcxxd/files/84f96d4f-b8b9-4b64-9d82-7d93a1a87c45/file_downloaded"


def download_file(url: str, output_path: Path, description: str) -> bool:
    """Download file using wget or curl."""
    print(f"\nDownloading {description}...")
    print(f"URL: {url}")
    print(f"Output: {output_path}")
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Try wget first, then curl
    try:
        result = subprocess.run(
            ["wget", "-c", "-O", str(output_path), url],
            check=True,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        try:
            result = subprocess.run(
                ["curl", "-L", "-o", str(output_path), url],
                check=True,
                capture_output=True,
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"ERROR: Failed to download. Install wget or curl.")
            return False


def extract_zip(zip_path: Path, extract_to: Path) -> bool:
    """Extract ZIP file."""
    print(f"\nExtracting {zip_path.name}...")
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_to)
        print(f"Extracted to: {extract_to}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to extract: {e}")
        return False


def process_aalto_dataset(data_dir: Path, output_path: Path, max_users: int = 5000) -> pd.DataFrame:
    """
    Process Aalto keystroke dataset.
    
    The Aalto dataset has one file per participant with format:
    PARTICIPANT_ID, TEST_SECTION_ID, SENTENCE, USER_INPUT, KEYSTROKE_ID, 
    PRESS_TIME, RELEASE_TIME, LETTER, KEYCODE
    """
    print(f"\nProcessing Aalto dataset (max {max_users} users)...")
    
    aalto_dir = data_dir / "Keystrokes"
    if not aalto_dir.exists():
        print(f"Aalto data not found at {aalto_dir}")
        return pd.DataFrame()
    
    records = []
    files = list(aalto_dir.glob("*.txt"))[:max_users]
    
    for i, f in enumerate(files):
        if i % 500 == 0:
            print(f"  Processing user {i+1}/{len(files)}...")
        
        try:
            # Read user file
            df = pd.read_csv(f, header=None, names=[
                'participant_id', 'test_section', 'sentence', 'user_input',
                'keystroke_id', 'press_time', 'release_time', 'letter', 'keycode'
            ])
            
            # Calculate timing
            df['dwell_time'] = df['release_time'] - df['press_time']
            df['flight_time'] = df['press_time'].diff().fillna(0)
            
            # Group by sentence (session)
            for (section, sentence), group in df.groupby(['test_section', 'sentence']):
                dwells = group['dwell_time'].values
                flights = group['flight_time'].values[1:]  # Skip first
                
                if len(dwells) < 10:
                    continue
                
                # Extract features
                record = extract_features_from_timing(
                    dwells, flights, 
                    label='human_organic',
                    session_id=f"{f.stem}_{section}_{hash(sentence) % 10000}"
                )
                records.append(record)
                
        except Exception as e:
            continue
    
    df = pd.DataFrame(records)
    print(f"Processed {len(df)} sessions from Aalto dataset")
    
    if len(df) > 0:
        df.to_csv(output_path, index=False)
        print(f"Saved to: {output_path}")
    
    return df


def process_liveness_dataset(data_dir: Path, output_path: Path) -> pd.DataFrame:
    """
    Process Liveness Detection dataset.
    
    Contains human-written samples and synthetic forgeries.
    """
    print(f"\nProcessing Liveness dataset...")
    
    liveness_dir = data_dir / "liveness"
    if not liveness_dir.exists():
        print(f"Liveness data not found at {liveness_dir}")
        return pd.DataFrame()
    
    records = []
    
    # Find all CSV files
    for csv_file in liveness_dir.rglob("*.csv"):
        try:
            df = pd.read_csv(csv_file)
            
            # Determine if human or synthetic based on path/filename
            is_human = 'human' in str(csv_file).lower() or 'genuine' in str(csv_file).lower()
            label = 'human_organic' if is_human else 'paste'  # Synthetic = paste-like
            
            # Process timing columns (format varies by source dataset)
            if 'hold_time' in df.columns and 'flight_time' in df.columns:
                dwells = df['hold_time'].values
                flights = df['flight_time'].values
            elif 'HT' in df.columns:  # Holdtime
                dwells = df['HT'].values
                flights = df.get('FT', df.get('flight_time', np.zeros(len(df)))).values
            else:
                continue
            
            # Clean data
            dwells = dwells[~np.isnan(dwells)]
            flights = flights[~np.isnan(flights)]
            
            if len(dwells) < 10:
                continue
            
            record = extract_features_from_timing(
                dwells, flights[:len(dwells)-1],
                label=label,
                session_id=f"liveness_{csv_file.stem}"
            )
            records.append(record)
            
        except Exception as e:
            continue
    
    df = pd.DataFrame(records)
    print(f"Processed {len(df)} sessions from Liveness dataset")
    
    if len(df) > 0:
        df.to_csv(output_path, index=False)
        print(f"Saved to: {output_path}")
    
    return df


def extract_features_from_timing(
    dwells: np.ndarray,
    flights: np.ndarray,
    label: str,
    session_id: str,
) -> dict:
    """Extract features matching synthetic data format."""
    
    from generate_synthetic import CLASS_TO_ID
    
    # Filter valid values
    dwells = dwells[(dwells > 0) & (dwells < 2000)]
    flights = flights[(flights > -500) & (flights < 5000)]
    
    if len(dwells) == 0:
        dwells = np.array([100.0])
    if len(flights) == 0:
        flights = np.array([80.0])
    
    # Pause detection
    pause_threshold = 500
    pauses = flights[flights > pause_threshold]
    
    return {
        'session_id': session_id,
        'label': label,
        'label_id': CLASS_TO_ID.get(label, 0),
        'total_keystrokes': len(dwells),
        'duration_ms': float(np.sum(dwells) + np.sum(flights)),
        'avg_dwell_time': float(np.mean(dwells)),
        'std_dwell_time': float(np.std(dwells)),
        'min_dwell_time': float(np.min(dwells)),
        'max_dwell_time': float(np.max(dwells)),
        'avg_flight_time': float(np.mean(flights)),
        'std_flight_time': float(np.std(flights)),
        'min_flight_time': float(np.min(flights)),
        'max_flight_time': float(np.max(flights)),
        'zero_dwell_ratio': 0.0,
        'zero_flight_ratio': 0.0,
        'pause_count': len(pauses),
        'pause_ratio': len(pauses) / max(len(flights), 1),
        'backspace_ratio': 0.0,  # Not available in timing-only data
        'tab_ratio': 0.0,
        'ctrl_ratio': 0.0,
        'symbol_ratio': 0.0,
        'long_pause_count': len(pauses),
        'avg_long_pause': float(np.mean(pauses)) if len(pauses) > 0 else 0.0,
        'burst_count': 0,
    }


def merge_datasets(data_dir: Path, output_path: Path) -> pd.DataFrame:
    """Merge synthetic and real datasets."""
    print("\n" + "=" * 50)
    print("Merging all datasets...")
    print("=" * 50)
    
    dfs = []
    
    # Load synthetic
    synthetic_path = data_dir / "synthetic_multiclass.csv"
    if synthetic_path.exists():
        df = pd.read_csv(synthetic_path)
        print(f"  Synthetic: {len(df)} samples")
        dfs.append(df)
    
    # Load Aalto
    aalto_path = data_dir / "aalto_processed.csv"
    if aalto_path.exists():
        df = pd.read_csv(aalto_path)
        print(f"  Aalto: {len(df)} samples")
        dfs.append(df)
    
    # Load Liveness
    liveness_path = data_dir / "liveness_processed.csv"
    if liveness_path.exists():
        df = pd.read_csv(liveness_path)
        print(f"  Liveness: {len(df)} samples")
        dfs.append(df)
    
    if not dfs:
        print("No datasets found!")
        return pd.DataFrame()
    
    combined = pd.concat(dfs, ignore_index=True)
    combined = combined.sample(frac=1, random_state=42).reset_index(drop=True)
    
    print(f"\nTotal combined: {len(combined)} samples")
    print("\nClass distribution:")
    print(combined['label'].value_counts())
    
    combined.to_csv(output_path, index=False)
    print(f"\nSaved to: {output_path}")
    
    return combined


def main():
    parser = argparse.ArgumentParser(description='Load and process real keystroke datasets')
    parser.add_argument('--data-dir', type=Path, default=Path('data'),
                        help='Data directory')
    parser.add_argument('--download-aalto', action='store_true',
                        help='Download Aalto dataset (1.4 GB)')
    parser.add_argument('--download-liveness', action='store_true',
                        help='Download Liveness dataset')
    parser.add_argument('--process-only', action='store_true',
                        help='Only process already-downloaded data')
    parser.add_argument('--max-users', type=int, default=5000,
                        help='Max users to process from Aalto')
    parser.add_argument('--merge', action='store_true',
                        help='Merge all datasets into combined file')
    args = parser.parse_args()
    
    print("=" * 50)
    print("HumanSign Real Dataset Loader")
    print("=" * 50)
    
    args.data_dir.mkdir(parents=True, exist_ok=True)
    
    # Download if requested
    if args.download_aalto:
        aalto_zip = args.data_dir / "Keystrokes.zip"
        if not aalto_zip.exists():
            print("\n⚠️  Aalto dataset is 1.4 GB. This may take a while...")
            download_file(AALTO_URL, aalto_zip, "Aalto Keystrokes")
            extract_zip(aalto_zip, args.data_dir)
        else:
            print(f"Aalto already downloaded: {aalto_zip}")
    
    if args.download_liveness:
        liveness_zip = args.data_dir / "liveness.zip"
        if not liveness_zip.exists():
            download_file(LIVENESS_URL, liveness_zip, "Liveness Detection")
            liveness_dir = args.data_dir / "liveness"
            liveness_dir.mkdir(exist_ok=True)
            extract_zip(liveness_zip, liveness_dir)
        else:
            print(f"Liveness already downloaded: {liveness_zip}")
    
    # Process datasets
    aalto_out = args.data_dir / "aalto_processed.csv"
    liveness_out = args.data_dir / "liveness_processed.csv"
    
    if (args.data_dir / "Keystrokes").exists():
        process_aalto_dataset(args.data_dir, aalto_out, args.max_users)
    
    if (args.data_dir / "liveness").exists():
        process_liveness_dataset(args.data_dir, liveness_out)
    
    # Merge
    if args.merge:
        combined_out = args.data_dir / "combined_multiclass.csv"
        merge_datasets(args.data_dir, combined_out)
    
    print("\n" + "=" * 50)
    print("Done!")
    print("=" * 50)
    print("\nNext steps:")
    print("  1. If you downloaded data, run: python train_multiclass.py --data data/combined_multiclass.csv")
    print("  2. Or merge datasets: python load_real_datasets.py --merge")


if __name__ == '__main__':
    main()
