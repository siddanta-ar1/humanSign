"""
Synthetic Data Generator for Multi-Class Keystroke Detection

Generates realistic keystroke timing patterns for 6 behavior classes:
1. human_organic - Natural typing with thinking pauses
2. paste - Bulk text insertion (Ctrl+V)
3. ai_assisted - AI autocomplete acceptance patterns
4. copy_paste_hybrid - Mixed typing and paste behavior
5. human_nonnative - Non-native English speaker patterns
6. human_coding - Programming typing patterns
"""

import argparse
import json
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple
import numpy as np
import pandas as pd


# Class labels
CLASSES = [
    'human_organic',
    'paste',
    'ai_assisted', 
    'copy_paste_hybrid',
    'human_nonnative',
    'human_coding',
]

CLASS_TO_ID = {c: i for i, c in enumerate(CLASSES)}


@dataclass
class KeystrokeSession:
    """A single keystroke session with timing data."""
    dwell_times: np.ndarray      # Key hold durations (ms)
    flight_times: np.ndarray     # Time between keys (ms) 
    key_codes: np.ndarray        # Key codes pressed
    pause_positions: np.ndarray  # Indices where pauses occurred
    label: str                   # Class label


def generate_organic_human(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate natural human typing patterns.
    
    Characteristics:
    - Dwell time: ~100ms with natural variance
    - Flight time: ~80ms with rhythm patterns
    - Thinking pauses: 5% probability, 500-3000ms
    - Backspace rate: 2-8%
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        n_keys = np.random.randint(50, 300)
        
        # Dwell times: natural variance
        dwell = np.random.normal(100, 30, n_keys)
        dwell = np.clip(dwell, 20, 400)
        
        # Flight times: rhythm with occasional pauses
        flight = np.random.normal(80, 40, n_keys - 1)
        flight = np.clip(flight, 10, 300)
        
        # Add thinking pauses (5% probability)
        pause_mask = np.random.random(len(flight)) < 0.05
        pause_positions = np.where(pause_mask)[0]
        flight[pause_mask] = np.random.uniform(500, 3000, pause_mask.sum())
        
        # Key codes (alphanumeric + common keys)
        # 65-90: A-Z, 48-57: 0-9, 32: space, 8: backspace
        key_codes = np.random.choice(
            list(range(65, 91)) + list(range(48, 58)) + [32] * 10 + [8] * 3,
            n_keys
        )
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=pause_positions,
            label='human_organic'
        ))
    
    return sessions


def generate_fast_human(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate fast human typing patterns (Pro/Gamer/Fast Typist).
    
    Characteristics:
    - Faster dwell times (~70ms)
    - Short flight times (~40ms), often overlapping (rollover)
    - Higher burst count, but consistent variance
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        n_keys = np.random.randint(100, 400)
        
        # Fast typing: shorter dwell
        dwell = np.random.normal(70, 15, n_keys)
        dwell = np.clip(dwell, 15, 150)
        
        # Fast flight (rollover typing)
        flight = np.random.normal(40, 20, n_keys - 1)
        flight = np.clip(flight, 5, 150) # Minimum 5ms to avoid 0ms (paste)
        
        # Occasional micro-pauses (thinking)
        pause_mask = np.random.random(len(flight)) < 0.02
        flight[pause_mask] = np.random.uniform(300, 1000, pause_mask.sum())
        
        key_codes = np.random.choice(
            list(range(65, 91)) + list(range(48, 58)) + [32] * 12 + [8] * 2,
            n_keys
        )
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=np.where(pause_mask)[0],
            label='human_organic' # Improve robustness of organic class
        ))
    
    return sessions


def generate_paste(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate paste event patterns.
    
    Characteristics:
    - Most characters have 0ms dwell/flight (pasted)
    - Preceded by Ctrl key pattern
    - Large blocks appear instantly
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        # Mix of typed intro + paste block
        n_typed = np.random.randint(5, 20)  # Small typed portion
        n_pasted = np.random.randint(50, 500)  # Large paste block
        n_keys = n_typed + n_pasted + 2  # +2 for Ctrl+V
        
        dwell = np.zeros(n_keys)
        flight = np.zeros(n_keys - 1)
        
        # Typed portion has normal timing
        dwell[:n_typed] = np.random.normal(100, 30, n_typed)
        flight[:n_typed-1] = np.random.normal(80, 40, max(1, n_typed-1))
        
        # Ctrl+V keys (indices n_typed, n_typed+1)
        dwell[n_typed] = np.random.uniform(80, 150)  # Ctrl hold
        dwell[n_typed + 1] = np.random.uniform(50, 100)  # V key
        flight[n_typed-1:n_typed+1] = np.random.uniform(20, 80, 2)
        
        # Pasted content: zero timing (instant appearance)
        # Already zeros from initialization
        
        # Key codes
        key_codes = np.zeros(n_keys, dtype=int)
        key_codes[:n_typed] = np.random.choice(range(65, 91), n_typed)
        key_codes[n_typed] = 17  # Ctrl
        key_codes[n_typed + 1] = 86  # V
        key_codes[n_typed + 2:] = np.random.choice(range(65, 91), n_pasted)
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=np.array([n_typed]),  # Pause before paste
            label='paste'
        ))
    
    return sessions


def generate_ai_assisted(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate AI autocomplete acceptance patterns (like GitHub Copilot).
    
    Characteristics:
    - Normal typing → pause → Tab/Enter → bulk insertion → resume typing
    - Inserted text has zero/near-zero timing
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        # Phase 1: Organic typing
        n_typed1 = np.random.randint(15, 40)
        # Phase 2: AI suggestion accepted
        n_inserted = np.random.randint(20, 100)
        # Phase 3: Continue typing
        n_typed2 = np.random.randint(10, 30)
        
        n_keys = n_typed1 + 1 + n_inserted + n_typed2  # +1 for Tab
        
        dwell = np.zeros(n_keys)
        flight = np.zeros(n_keys - 1)
        
        # Phase 1: Normal typing
        dwell[:n_typed1] = np.random.normal(100, 30, n_typed1)
        flight[:n_typed1-1] = np.random.normal(80, 40, max(1, n_typed1-1))
        
        # Pause before AI suggestion appears
        flight[n_typed1 - 1] = np.random.uniform(200, 800)
        
        # Tab to accept
        dwell[n_typed1] = np.random.uniform(50, 120)
        flight[n_typed1] = np.random.uniform(30, 100)
        
        # AI-inserted content: very fast (near-zero)
        start = n_typed1 + 1
        end = start + n_inserted
        dwell[start:end] = np.random.uniform(0, 5, n_inserted)
        flight[start:end-1] = np.random.uniform(0, 5, n_inserted - 1)
        
        # Phase 3: Resume normal typing
        flight[end - 1] = np.random.uniform(100, 300)  # Small pause after insertion
        dwell[end:] = np.random.normal(100, 30, n_typed2)
        flight[end:n_keys-1] = np.random.normal(80, 40, n_keys - 1 - end)
        
        # Key codes
        key_codes = np.zeros(n_keys, dtype=int)
        key_codes[:n_typed1] = np.random.choice(range(65, 91), n_typed1)
        key_codes[n_typed1] = 9  # Tab
        key_codes[start:end] = np.random.choice(range(65, 91), n_inserted)
        key_codes[end:] = np.random.choice(range(65, 91), n_typed2)
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=np.array([n_typed1 - 1]),
            label='ai_assisted'
        ))
    
    return sessions


def generate_copy_paste_hybrid(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate mixed typing and paste behavior.
    
    Characteristics:
    - Interleaved organic typing and paste events
    - 20-60% content is pasted
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        n_segments = np.random.randint(3, 7)
        all_dwell = []
        all_flight = []
        all_keys = []
        pause_positions = []
        
        for seg in range(n_segments):
            is_paste = np.random.random() < 0.4  # 40% paste segments
            
            if is_paste:
                n_chars = np.random.randint(20, 100)
                # Ctrl+V + pasted content
                all_dwell.extend([80, 60] + [0] * n_chars)
                all_flight.extend([50, 30] + [0] * (n_chars - 1))
                all_keys.extend([17, 86] + list(np.random.choice(range(65, 91), n_chars)))
                pause_positions.append(len(all_dwell) - n_chars - 2)
            else:
                n_chars = np.random.randint(20, 60)
                dwell = np.random.normal(100, 30, n_chars)
                flight = np.random.normal(80, 40, n_chars - 1)
                all_dwell.extend(dwell.tolist())
                all_flight.extend(flight.tolist())
                all_keys.extend(list(np.random.choice(range(65, 91), n_chars)))
            
            # Add inter-segment gap
            if seg < n_segments - 1 and len(all_flight) > 0:
                all_flight.append(np.random.uniform(200, 800))
        
        sessions.append(KeystrokeSession(
            dwell_times=np.array(all_dwell),
            flight_times=np.array(all_flight[:len(all_dwell) - 1]),
            key_codes=np.array(all_keys),
            pause_positions=np.array(pause_positions),
            label='copy_paste_hybrid'
        ))
    
    return sessions


def generate_nonnative(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate non-native English speaker typing patterns.
    
    Characteristics:
    - Slower dwell times (~150ms)
    - Longer flight times (~120ms)
    - Higher backspace rate (5-15%)
    - Still shows natural human variance
    """
    np.random.seed(seed)
    sessions = []
    
    for i in range(n_samples):
        n_keys = np.random.randint(50, 250)
        
        # Slower, more deliberate typing
        dwell = np.random.normal(150, 40, n_keys)
        dwell = np.clip(dwell, 40, 600)
        
        flight = np.random.normal(120, 50, n_keys - 1)
        flight = np.clip(flight, 20, 500)
        
        # More pauses (hesitation)
        pause_mask = np.random.random(len(flight)) < 0.08
        pause_positions = np.where(pause_mask)[0]
        flight[pause_mask] = np.random.uniform(400, 2000, pause_mask.sum())
        
        # Higher backspace rate
        backspace_rate = np.random.uniform(0.05, 0.15)
        n_backspace = int(n_keys * backspace_rate)
        
        key_codes = np.random.choice(
            list(range(65, 91)) + list(range(48, 58)) + [32] * 8,
            n_keys
        )
        # Insert backspaces
        backspace_positions = np.random.choice(n_keys, n_backspace, replace=False)
        key_codes[backspace_positions] = 8
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=pause_positions,
            label='human_nonnative'
        ))
    
    return sessions


def generate_coding(n_samples: int, seed: int = 42) -> List[KeystrokeSession]:
    """
    Generate programming/coding typing patterns.
    
    Characteristics:
    - High symbol usage (20-40%)
    - Short burst typing (variable names)
    - Tab/Space clusters (indentation)
    - Long thinking pauses
    """
    np.random.seed(seed)
    sessions = []
    
    # Common coding symbols
    SYMBOLS = [
        123, 125,  # { }
        91, 93,    # [ ]
        40, 41,    # ( )
        59, 58,    # ; :
        61,        # =
        46,        # .
        44,        # ,
        39, 34,    # ' "
        47,        # /
        60, 62,    # < >
    ]
    
    for i in range(n_samples):
        n_keys = np.random.randint(80, 400)
        
        # Faster bursts with longer pauses
        dwell = np.random.normal(90, 25, n_keys)
        dwell = np.clip(dwell, 15, 350)
        
        flight = np.random.normal(70, 35, n_keys - 1)
        flight = np.clip(flight, 5, 250)
        
        # More frequent long pauses (thinking about logic)
        pause_mask = np.random.random(len(flight)) < 0.10
        pause_positions = np.where(pause_mask)[0]
        flight[pause_mask] = np.random.uniform(1000, 5000, pause_mask.sum())
        
        # High symbol ratio
        symbol_ratio = np.random.uniform(0.2, 0.4)
        n_symbols = int(n_keys * symbol_ratio)
        
        # Tab clusters (indentation)
        n_tabs = np.random.randint(5, 20)
        
        # Key distribution
        key_codes = np.random.choice(
            list(range(65, 91)) + list(range(48, 58)) + [32] * 5,  # Letters + nums + space
            n_keys
        )
        
        # Insert symbols
        symbol_positions = np.random.choice(n_keys, n_symbols, replace=False)
        key_codes[symbol_positions] = np.random.choice(SYMBOLS, n_symbols)
        
        # Insert tabs
        tab_positions = np.random.choice(n_keys, min(n_tabs, n_keys), replace=False)
        key_codes[tab_positions] = 9
        
        sessions.append(KeystrokeSession(
            dwell_times=dwell,
            flight_times=flight,
            key_codes=key_codes,
            pause_positions=pause_positions,
            label='human_coding'
        ))
    
    return sessions


def sessions_to_dataframe(sessions: List[KeystrokeSession]) -> pd.DataFrame:
    """Convert sessions to training DataFrame format."""
    records = []
    
    for idx, session in enumerate(sessions):
        record = {
            'session_id': idx,
            'label': session.label,
            'label_id': CLASS_TO_ID[session.label],
            'total_keystrokes': len(session.dwell_times),
            'duration_ms': float(np.sum(session.dwell_times) + np.sum(session.flight_times)),
        }
        
        # Timing stats
        dwells = session.dwell_times[session.dwell_times > 0]  # Exclude zeros
        flights = session.flight_times[session.flight_times > 0]
        
        if len(dwells) > 0:
            record['avg_dwell_time'] = float(np.mean(dwells))
            record['std_dwell_time'] = float(np.std(dwells))
            record['min_dwell_time'] = float(np.min(dwells))
            record['max_dwell_time'] = float(np.max(dwells))
        else:
            record['avg_dwell_time'] = 0.0
            record['std_dwell_time'] = 0.0
            record['min_dwell_time'] = 0.0
            record['max_dwell_time'] = 0.0
        
        if len(flights) > 0:
            record['avg_flight_time'] = float(np.mean(flights))
            record['std_flight_time'] = float(np.std(flights))
            record['min_flight_time'] = float(np.min(flights))
            record['max_flight_time'] = float(np.max(flights))
        else:
            record['avg_flight_time'] = 0.0
            record['std_flight_time'] = 0.0
            record['min_flight_time'] = 0.0
            record['max_flight_time'] = 0.0
        
        # Special features
        record['zero_dwell_ratio'] = float(np.mean(session.dwell_times == 0))
        record['zero_flight_ratio'] = float(np.mean(session.flight_times == 0))
        record['pause_count'] = len(session.pause_positions)
        record['pause_ratio'] = len(session.pause_positions) / max(len(session.flight_times), 1)
        
        # Key type ratios
        keys = session.key_codes
        record['backspace_ratio'] = float(np.mean(keys == 8))
        record['tab_ratio'] = float(np.mean(keys == 9))
        record['ctrl_ratio'] = float(np.mean(keys == 17))
        record['symbol_ratio'] = float(np.mean((keys >= 33) & (keys <= 47) | (keys >= 58) & (keys <= 64)))
        
        # Long pause features
        long_pauses = session.flight_times[session.flight_times > 500]
        record['long_pause_count'] = len(long_pauses)
        record['avg_long_pause'] = float(np.mean(long_pauses)) if len(long_pauses) > 0 else 0.0
        
        # Burst detection (consecutive fast keystrokes)
        fast_mask = session.flight_times < 50
        burst_count = 0
        in_burst = False
        for is_fast in fast_mask:
            if is_fast and not in_burst:
                burst_count += 1
                in_burst = True
            elif not is_fast:
                in_burst = False
        record['burst_count'] = burst_count
        
        records.append(record)
    
    return pd.DataFrame(records)


def generate_all_classes(
    samples_per_class: dict = None,
    output_dir: Path = None,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate synthetic data for all classes."""
    
    if samples_per_class is None:
        samples_per_class = {
            'human_organic': 5000,
            'paste': 3000,
            'ai_assisted': 3000,
            'copy_paste_hybrid': 2000,
            'human_nonnative': 2000,
            'human_coding': 3000,
        }
    
    generators = {
        'human_organic': generate_organic_human,
        'paste': generate_paste,
        'ai_assisted': generate_ai_assisted,
        'copy_paste_hybrid': generate_copy_paste_hybrid,
        'human_nonnative': generate_nonnative,
        'human_coding': generate_coding,
    }
    
    all_sessions = []
    
    for class_name, n_samples in samples_per_class.items():
        print(f"Generating {n_samples} samples for '{class_name}'...")
        
        if class_name == 'human_organic':
            # Mix standard (60%) and fast (40%) profiles for robustness
            n_standard = int(n_samples * 0.6)
            n_fast = n_samples - n_standard
            
            print(f"  - {n_standard} Standard Human")
            print(f"  - {n_fast} Fast Human (Robustness)")
            
            gen_standard = generators[class_name]
            sessions_std = gen_standard(n_standard, seed=seed)
            sessions_fast = generate_fast_human(n_fast, seed=seed + 1)
            sessions = sessions_std + sessions_fast
        else:
            generator = generators[class_name]
            sessions = generator(n_samples, seed=seed + hash(class_name) % 1000)
            
        all_sessions.extend(sessions)
    
    print(f"\nTotal sessions generated: {len(all_sessions)}")
    
    # Convert to DataFrame
    df = sessions_to_dataframe(all_sessions)
    
    # Shuffle
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    
    # Save if output dir specified
    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        csv_path = output_dir / 'synthetic_multiclass.csv'
        df.to_csv(csv_path, index=False)
        print(f"Saved to: {csv_path}")
        
        # Save metadata
        meta = {
            'classes': CLASSES,
            'class_to_id': CLASS_TO_ID,
            'samples_per_class': samples_per_class,
            'total_samples': len(df),
            'features': list(df.columns),
        }
        meta_path = output_dir / 'dataset_metadata.json'
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)
        print(f"Metadata saved to: {meta_path}")
    
    return df


def main():
    parser = argparse.ArgumentParser(description='Generate synthetic keystroke data')
    parser.add_argument('--output-dir', type=Path, default=Path('data'),
                        help='Output directory for generated data')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed for reproducibility')
    parser.add_argument('--samples', type=int, default=None,
                        help='Override samples per class (equal distribution)')
    args = parser.parse_args()
    
    print("=" * 50)
    print("HumanSign Synthetic Data Generator")
    print("=" * 50)
    print()
    
    samples_per_class = None
    if args.samples:
        samples_per_class = {c: args.samples for c in CLASSES}
    
    df = generate_all_classes(
        samples_per_class=samples_per_class,
        output_dir=args.output_dir,
        seed=args.seed,
    )
    
    print("\n" + "=" * 50)
    print("Class Distribution:")
    print(df['label'].value_counts())
    print("=" * 50)
    
    print("\nDone! Use this data with train_multiclass.py")


if __name__ == '__main__':
    main()
