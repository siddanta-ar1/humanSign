from types import SimpleNamespace

def _detect_ai_burst(keystrokes: list) -> bool:
    """Check for sequences of > 5 keys with extremely low dwell/flight (< 8ms)."""
    consecutive_fast = 0
    max_consecutive = 0
    print(f"[DEBUG] Scanning {len(keystrokes)} keys for AI burst...")
    
    for i, k in enumerate(keystrokes):
        dwell = k.dwell_time if k.dwell_time is not None else 999
        flight = k.flight_time if k.flight_time is not None else 999
        
        # Debug first few keys
        if i < 5:
            print(f"[DEBUG] Key {i}: Dwell={dwell}, Flight={flight}")

        if (dwell < 8.0 and flight < 8.0):
            consecutive_fast += 1
            if consecutive_fast >= 5:
                print(f"[DEBUG] AI Burst FOUND! {consecutive_fast} consecutive fast keys.")
                return True
        else:
            if consecutive_fast > 1:
                # Log when a sequence breaks
                print(f"[DEBUG] Sequence broke at {consecutive_fast}. Cause: Dwell={dwell}, Flight={flight}")
            max_consecutive = max(max_consecutive, consecutive_fast)
            consecutive_fast = 0
            
    print(f"[DEBUG] No AI burst found. Max consecutive: {max_consecutive}")
    return False

def test_burst():
    # Simulate 10 fast keys
    keys = []
    for i in range(10):
        keys.append(SimpleNamespace(
            dwell_time=3.5,
            flight_time=2.1
        ))
    
    print("Testing 10 fast keys...")
    result = _detect_ai_burst(keys)
    print(f"Result: {result}")

    # Simulate mixed: 5 slow, 5 fast
    keys_mixed = []
    # 5 slow
    for i in range(5):
        keys_mixed.append(SimpleNamespace(dwell_time=100.0, flight_time=50.0))
    # 6 fast
    for i in range(6):
        keys_mixed.append(SimpleNamespace(dwell_time=3.0, flight_time=3.0))
        
    print("Testing Mixed...")
    result_mixed = _detect_ai_burst(keys_mixed)
    print(f"Result Mixed: {result_mixed}")

if __name__ == "__main__":
    test_burst()
