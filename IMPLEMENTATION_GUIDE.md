# HumanSign Implementation Guide
## Achieving 95%+ Accuracy: Step-by-Step Implementation

**Last Updated**: 2025-01-XX  
**Status**: Ready for Implementation  
**Estimated Time**: 2-3 weeks

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Phase 1: Critical Fixes (Week 1)](#phase-1-critical-fixes-week-1)
3. [Phase 2: Testing & Validation (Week 2)](#phase-2-testing--validation-week-2)
4. [Phase 3: Optimization (Week 3)](#phase-3-optimization-week-3)
5. [Verification Checklist](#verification-checklist)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

```bash
# Backend
cd server
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend/Extension
cd ../client
npm install

# Web App
cd ../web
npm install

# ML Training
cd ../ml
pip install -r requirements.txt
```

### Run Tests

```bash
# Test the hybrid verification system
cd server
python test_hybrid_verification.py

# Expected output:
# ✅ All burst detection tests passed!
# ✅ All feature extraction tests passed!
# ✅ All ML inference tests passed!
# ✅ All volume analysis tests passed!
```

---

## Phase 1: Critical Fixes (Week 1)

### Day 1: Enable ML Verification

**Status**: ✅ COMPLETED (code already updated)

The verification endpoint has been updated to use ML predictions actively instead of just for stats.

**What Changed**:
- File: `server/app/api/routes/verification.py`
- ML model now runs on every verification request
- Hybrid scoring combines: Volume (50%) + ML (30%) + Burst Detection (20%)

**Verify It Works**:

```bash
cd server
python test_hybrid_verification.py
```

**Expected Results**:
- Test 3.2: Human-like features → predicted as "human_organic"
- Test 3.3: AI-like features → predicted as "ai_assisted" or "paste"

---

### Day 2: Add Burst Detection

**Status**: ✅ COMPLETED (code already updated)

Burst detection has been added to identify AI autocomplete signatures.

**What Changed**:
- File: `server/app/services/feature_extractor.py`
- New method: `detect_ai_bursts(keystrokes)`
- Detects 5+ consecutive keys with both dwell < 8ms AND flight < 8ms

**How It Works**:

```python
# AI Signature: Consecutive fast keys
# dwell_time < 8ms AND flight_time < 8ms for 5+ keys in a row

# Example AI burst:
# Key 1: dwell=3ms, flight=2ms ✓
# Key 2: dwell=4ms, flight=3ms ✓
# Key 3: dwell=2ms, flight=2ms ✓
# Key 4: dwell=3ms, flight=3ms ✓
# Key 5: dwell=4ms, flight=2ms ✓
# → BURST DETECTED!

# Human typing (should not trigger):
# Key 1: dwell=95ms, flight=75ms ✗ (too slow)
# Key 2: dwell=105ms, flight=82ms ✗
```

**Test It**:

```bash
cd server
python test_hybrid_verification.py

# Look for:
# [Test 1.1] Pure AI burst (10 fast keys)
#   Has burst: True
#   Burst count: 1
#   ✓ PASS
```

---

### Day 3-4: Fix Extension Race Conditions

**Status**: ⚠️ NEEDS IMPLEMENTATION

**Problem**: Multiple event listeners can count the same text insertion multiple times.

**Files to Modify**:
1. `client/src/content/keystroke-tracker.ts`

**Implementation**:

#### Step 3.1: Add Event Deduplication

```typescript
// Add to keystroke-tracker.ts class

private eventCache = new Set<string>();

private isDuplicateEvent(type: string, code: number, timestamp: number): boolean {
    const key = `${type}-${code}-${timestamp.toFixed(0)}`;
    
    // Check if we've seen this exact event in the last 100ms
    if (this.eventCache.has(key)) {
        console.log('[HumanSign] Duplicate event filtered:', key);
        return true;
    }
    
    this.eventCache.add(key);
    
    // Auto-cleanup after 100ms
    setTimeout(() => this.eventCache.delete(key), 100);
    
    return false;
}
```

#### Step 3.2: Add to Event Handlers

```typescript
// In handleKeyDown
private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isTracking || !this.sessionId) return;
    
    // NEW: Check for duplicates
    if (this.isDuplicateEvent('keydown', event.keyCode, performance.now())) {
        return;
    }
    
    // ... rest of handler
};

// In handleKeyUp
private handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.isTracking || !this.sessionId) return;
    
    // NEW: Check for duplicates
    if (this.isDuplicateEvent('keyup', event.keyCode, performance.now())) {
        return;
    }
    
    // ... rest of handler
};
```

#### Step 3.3: Add Ignore Window After Paste

```typescript
// Add to class
private ignoredUntil: number = 0;

// Update handlePaste
private handlePaste = (event: ClipboardEvent): void => {
    if (!this.isTracking || !this.sessionId) return;
    
    const pastedText = event.clipboardData?.getData('text') || '';
    const pastedLength = pastedText.length;
    
    if (pastedLength > 0) {
        // ... existing paste handling code ...
        
        // NEW: Ignore input events for 200ms after paste
        this.ignoredUntil = performance.now() + 200;
        
        console.log(`[HumanSign] Paste detected: ${pastedLength} chars (ignoring input events for 200ms)`);
    }
};

// Update handleInput to respect ignore window
private handleInput = (event: Event): void => {
    if (!this.isTracking) return;
    
    // NEW: Skip if in ignore window (after paste)
    if (performance.now() < this.ignoredUntil) {
        console.log('[HumanSign] Input event ignored (paste window)');
        return;
    }
    
    // ... rest of handler
};
```

#### Step 3.4: Rebuild Extension

```bash
cd client
npm run build

# Output should show:
# ✓ built in XXXms
```

**Test It**:
1. Load unpacked extension in Chrome
2. Open test page with editor
3. Type "hello" then paste "world"
4. Check console: Should see "Paste detected" followed by "Input event ignored"
5. Verify no double counting in background worker

---

### Day 5: Enhanced AI Detection

**Status**: ⚠️ NEEDS IMPLEMENTATION

**Goal**: Catch AI insertions that don't trigger standard events.

**File to Modify**: `client/src/content/keystroke-tracker.ts`

#### Step 5.1: Add Text Length Monitoring

```typescript
// Add to class
private lastTextLength = 0;
private lastTextLengthCheck = 0;

private checkTextLengthJump(): void {
    const now = performance.now();
    
    // Throttle checks to every 100ms
    if (now - this.lastTextLengthCheck < 100) return;
    this.lastTextLengthCheck = now;
    
    // Get current text length from active element
    const activeEl = document.activeElement as HTMLElement | null;
    let currentLength = 0;
    
    if (activeEl) {
        if (activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement) {
            currentLength = activeEl.value.length;
        } else if (activeEl.isContentEditable) {
            currentLength = activeEl.textContent?.length || 0;
        } else {
            // Check for ProseMirror
            const proseMirror = document.querySelector('.ProseMirror');
            if (proseMirror) {
                currentLength = proseMirror.textContent?.length || 0;
            }
        }
    }
    
    const delta = currentLength - this.lastTextLength;
    const timeSinceLastInput = now - this.lastInputTime;
    
    // AI signature: >20 chars appear in <100ms without keyboard events
    if (delta > 20 && timeSinceLastInput > 100) {
        console.log(`[HumanSign] Suspicious text jump: +${delta} chars in ${timeSinceLastInput.toFixed(0)}ms`);
        this.recordSilentAI(delta);
    }
    
    this.lastTextLength = currentLength;
}
```

#### Step 5.2: Call in observeDOM

```typescript
private observeDOM(): void {
    // ... existing observer setup ...
    
    // NEW: Add periodic text length checks
    const checkInterval = setInterval(() => {
        if (!this.isTracking) {
            clearInterval(checkInterval);
            return;
        }
        this.checkTextLengthJump();
    }, 100); // Check every 100ms
}
```

#### Step 5.3: Update recordSilentAI

```typescript
private recordSilentAI(charCount: number): void {
    const currentTime = performance.now();
    
    // Record as AI assistant event
    this.events.push({
        event_type: 'ai_assistant',
        key_code: charCount, // Store volume
        key_char: null,
        client_timestamp: currentTime,
        input_method: 'ai_assistant'
    });
    
    this.totalPastedChars += charCount; // Count as non-human
    this.scheduleFlush();
}
```

**Test It**:
1. Open editor with AI autocomplete (GitHub Copilot)
2. Start typing a function
3. Accept AI suggestion (usually Tab key)
4. Check console: Should see "Suspicious text jump" or "AI Insert Detected"

---

### Day 6-7: Integration Testing

**Create Test Dataset**:

```bash
# Create test data file
cd server
cat > test_data.json << EOF
[
  {
    "name": "Pure human typing",
    "keystrokes": 100,
    "paste_count": 0,
    "ai_count": 0,
    "expected": "human_verified"
  },
  {
    "name": "Heavy paste",
    "keystrokes": 40,
    "paste_count": 60,
    "ai_count": 0,
    "expected": "paste_detected"
  },
  {
    "name": "AI assisted",
    "keystrokes": 70,
    "paste_count": 0,
    "ai_count": 30,
    "expected": "ai_assisted"
  },
  {
    "name": "Under threshold",
    "keystrokes": 91,
    "paste_count": 0,
    "ai_count": 9,
    "expected": "human_verified"
  }
]
EOF
```

**Run Full Test Suite**:

```bash
# Test backend
python test_hybrid_verification.py

# Start backend server
uvicorn app.main:app --reload --port 8000

# In another terminal, test API
curl -X POST http://localhost:8000/verify \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test-session-id"}'
```

**Manual Testing Checklist**:
- [ ] Type 100 characters naturally → "human_verified"
- [ ] Paste 50 characters → "paste_detected"
- [ ] Accept GitHub Copilot suggestion → "ai_assisted"
- [ ] Type fast (200 WPM) → Should NOT flag as AI
- [ ] Mix: 50 typed + 5 pasted → "human_verified" (under threshold)

---

## Phase 2: Testing & Validation (Week 2)

### Day 8-9: Real-World AI Tool Testing

**Objective**: Test against actual AI autocomplete tools.

#### Setup Test Environment

1. **Install AI Tools**:
   ```bash
   # GitHub Copilot (requires license)
   # Install from VS Code marketplace
   
   # For ChatGPT/Claude integration:
   # Use browser extension or API
   ```

2. **Create Test Script**:

```python
# server/test_real_ai.py

import asyncio
from app.services.feature_extractor import feature_extractor

async def test_copilot_session():
    """
    Manually test with GitHub Copilot:
    1. Start typing a function
    2. Accept Copilot suggestion (Tab)
    3. Record keystroke pattern
    """
    print("Test: GitHub Copilot")
    print("Instructions:")
    print("1. Open VS Code with extension running")
    print("2. Start typing: 'def calculate_fibonacci('")
    print("3. Wait for Copilot suggestion")
    print("4. Press Tab to accept")
    print("5. Check extension console for AI burst detection")
    print()
    print("Expected: 'AI Insert Detected' or 'Suspicious text jump'")
    input("Press Enter when ready...")

async def test_grammarly_session():
    """Test with Grammarly corrections."""
    print("Test: Grammarly")
    print("Instructions:")
    print("1. Type text with intentional errors")
    print("2. Accept Grammarly suggestion")
    print("3. Check if detected as AI or paste")
    input("Press Enter when ready...")

if __name__ == "__main__":
    asyncio.run(test_copilot_session())
    asyncio.run(test_grammarly_session())
```

#### Document Results

Create `server/TEST_RESULTS.md`:

```markdown
# Real-World AI Tool Test Results

## GitHub Copilot
- **Test Date**: YYYY-MM-DD
- **Detection Rate**: X/10 attempts detected
- **Timing Pattern**: Avg dwell=Xms, flight=Xms
- **Notes**: [Observations]

## Grammarly
- **Test Date**: YYYY-MM-DD
- **Detection Rate**: X/10 attempts detected
- **Timing Pattern**: [Pattern observed]
- **Notes**: [Observations]

## ChatGPT Autocomplete
- **Test Date**: YYYY-MM-DD
- **Detection Rate**: X/10 attempts detected
- **Notes**: [Observations]
```

---

### Day 10-11: Model Retraining (If Needed)

**If real AI tools have different timing than synthetic data**:

#### Collect Real Data

```python
# ml/src/collect_real_data.py

import json
from datetime import datetime

def record_session(session_type: str, keystrokes: list, label: str):
    """Record a real keystroke session for training."""
    data = {
        'timestamp': datetime.now().isoformat(),
        'session_type': session_type,
        'label': label,
        'keystrokes': len(keystrokes),
        'events': keystrokes
    }
    
    filename = f"data/real/{session_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Saved: {filename}")

# Use this during manual testing to record real patterns
```

#### Update Synthetic Generator

If AI tools use 10-30ms instead of 0-5ms:

```python
# ml/src/generate_synthetic.py

def generate_ai_assisted(n_samples: int, seed: int = 42):
    # ... existing code ...
    
    # UPDATE: Use realistic timing based on observations
    # OLD: dwell[start:end] = np.random.uniform(0, 5, n_inserted)
    # NEW: Match observed Copilot pattern
    dwell[start:end] = np.random.uniform(10, 30, n_inserted)  # Adjusted!
    flight[start:end-1] = np.random.uniform(10, 30, n_inserted - 1)
```

#### Retrain Model

```bash
cd ml

# Regenerate synthetic data with updated parameters
python src/generate_synthetic.py

# Retrain model
python src/train_multiclass.py

# Export to ONNX
python src/export_multiclass_onnx.py

# Copy to server
cp models/keystroke_multiclass.onnx ../server/
cp models/model_metadata.json ../models/
```

---

### Day 12-14: Accuracy Measurement

**Create Accuracy Test Suite**:

```python
# server/test_accuracy.py

from collections import defaultdict

def calculate_metrics(predictions: list, ground_truth: list):
    """Calculate precision, recall, F1."""
    
    # Confusion matrix
    tp = sum(1 for p, gt in zip(predictions, ground_truth) 
             if p == 'non_human' and gt == 'non_human')
    tn = sum(1 for p, gt in zip(predictions, ground_truth)
             if p == 'human' and gt == 'human')
    fp = sum(1 for p, gt in zip(predictions, ground_truth)
             if p == 'non_human' and gt == 'human')
    fn = sum(1 for p, gt in zip(predictions, ground_truth)
             if p == 'human' and gt == 'non_human')
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / (tp + tn + fp + fn)
    
    print(f"Accuracy: {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall: {recall:.2%}")
    print(f"F1 Score: {f1:.2%}")
    print(f"False Positive Rate: {fp / (fp + tn) if (fp + tn) > 0 else 0:.2%}")
    
    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1': f1
    }

# Test with labeled dataset
test_cases = [
    # Format: (keystrokes, paste_chars, ai_chars, ground_truth)
    (100, 0, 0, 'human'),      # Pure human
    (40, 60, 0, 'non_human'),  # Heavy paste
    (70, 0, 30, 'non_human'),  # AI assisted
    (91, 0, 9, 'human'),       # Under threshold (edge case)
    # Add 100+ test cases
]

predictions = []
ground_truth = []

for keystrokes, paste, ai, truth in test_cases:
    # Run verification
    # prediction = verify_session(...)
    # predictions.append(prediction)
    ground_truth.append(truth)

metrics = calculate_metrics(predictions, ground_truth)
```

**Success Criteria**:
- Accuracy > 90%
- False Positive Rate < 10%
- Recall on AI detection > 85%

---

## Phase 3: Optimization (Week 3)

### Day 15-16: Performance Optimization

#### Backend Optimization

```python
# Add caching for repeated verifications
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_cached_features(session_id: str):
    """Cache feature extraction for 5 minutes."""
    # ... extract features ...
    return features
```

#### Extension Optimization

```typescript
// Reduce batch flush frequency for better performance
const FLUSH_INTERVAL_MS = 2000; // Increase from 1000ms
const MIN_FLUSH_SIZE = 50; // Increase from 10
```

---

### Day 17-18: User Experience Improvements

#### Add Live Confidence Score

```typescript
// In extension popup
function updateLiveScore(confidence: number) {
    const scoreEl = document.getElementById('confidence-score');
    const color = confidence > 0.8 ? 'green' : confidence > 0.5 ? 'yellow' : 'red';
    
    scoreEl.textContent = `${(confidence * 100).toFixed(0)}%`;
    scoreEl.style.color = color;
}
```

#### Add Alerts for Suspicious Activity

```python
# In verification endpoint
if burst_analysis['has_burst'] and not final_is_human:
    # Send real-time alert to extension
    await send_websocket_alert(session_id, {
        'type': 'burst_detected',
        'severity': 'high',
        'message': f"AI burst detected at position {burst_analysis['burst_positions'][0]}"
    })
```

---

### Day 19-21: Documentation & Deployment

#### Update API Documentation

```bash
cd server
# Generate OpenAPI docs
python -c "from app.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > openapi.json
```

#### Create Deployment Guide

```markdown
# Deployment Checklist

## Backend
- [ ] Set environment variables (DATABASE_URL, ONNX_MODEL_PATH)
- [ ] Run database migrations
- [ ] Start uvicorn with gunicorn workers
- [ ] Enable HTTPS
- [ ] Set up monitoring (Sentry, DataDog)

## Extension
- [ ] Update manifest.json version
- [ ] Build production bundle: `npm run build`
- [ ] Test in Chrome/Edge
- [ ] Submit to Chrome Web Store
- [ ] Create Firefox port (if needed)

## Monitoring
- [ ] Set up accuracy tracking dashboard
- [ ] Enable error logging
- [ ] Create alerts for high false positive rates
```

---

## Verification Checklist

Before declaring "production ready":

### Functional Tests
- [ ] Pure human typing → verified with >90% confidence
- [ ] Paste operation → detected with >95% accuracy
- [ ] AI autocomplete → detected with >85% accuracy
- [ ] Fast human (200 WPM) → NOT flagged as AI
- [ ] Mixed scenarios → correct weighted verdict

### Performance Tests
- [ ] Verification completes in <200ms
- [ ] Extension doesn't slow down typing (no lag)
- [ ] Database queries optimized (indexed on session_id)
- [ ] ML inference cached appropriately

### Edge Cases
- [ ] Very short sessions (<20 chars) → handled gracefully
- [ ] Very long sessions (>10k chars) → doesn't timeout
- [ ] Network failure → batches queued, retry logic works
- [ ] Browser crash → session state restored from chrome.storage

### Security
- [ ] API endpoints rate-limited
- [ ] Session IDs are UUIDs (not guessable)
- [ ] Keystroke data encrypted in transit (HTTPS)
- [ ] Database credentials secured (env vars, not hardcoded)

### User Experience
- [ ] Extension icon shows tracking status
- [ ] Clear feedback on verification results
- [ ] No false alarms for legitimate fast typing
- [ ] Privacy policy clearly explains data collection

---

## Troubleshooting

### Issue: ML Model Not Loading

**Symptoms**: "Model not loaded" error in logs

**Solutions**:
```bash
# Check model file exists
ls -lh server/keystroke_multiclass.onnx

# Verify ONNX Runtime installed
pip show onnxruntime

# Test model loading manually
python -c "import onnxruntime; print(onnxruntime.get_device())"

# Rebuild model if needed
cd ml
python src/export_multiclass_onnx.py
```

---

### Issue: Burst Detection Too Sensitive

**Symptoms**: Fast human typists flagged as AI

**Solution**: Adjust threshold in `feature_extractor.py`:

```python
# Increase threshold from 8ms to 10ms
if dwell < 10.0 and flight < 10.0:  # Was 8.0
    consecutive_fast += 1
```

---

### Issue: Extension Not Capturing Events

**Symptoms**: No keystrokes recorded in session

**Solutions**:
```javascript
// Check content script injected
chrome.tabs.query({active: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {type: 'PING'}, (response) => {
        console.log('Content script responding:', response);
    });
});

// Verify permissions in manifest.json
"permissions": [
    "activeTab",
    "storage",
    "tabs"
],
"host_permissions": [
    "http://*/*",
    "https://*/*"
]
```

---

### Issue: False Positives on Paste

**Symptoms**: Manual typing detected as paste

**Diagnosis**:
```python
# Check event_type distribution
keystrokes = await keystroke_service.get_session_keystrokes(session_id)
event_types = Counter(k.event_type for k in keystrokes)
print(event_types)  # Should be mostly 1 (keydown) and 2 (keyup)
```

**Fix**: Ensure paste handler only triggers on actual paste events, not input events.

---

### Issue: Database Connection Errors

**Symptoms**: "asyncpg.exceptions.TooManyConnectionsError"

**Solution**:
```python
# Reduce pool size in config.py
database_pool_size: int = 5  # Was 10

# Or increase PostgreSQL max_connections
# Edit postgresql.conf:
# max_connections = 200
```

---

## Success Metrics

Track these metrics weekly:

```python
# Example monitoring dashboard
metrics = {
    'accuracy': 0.92,  # Target: >0.90
    'false_positive_rate': 0.08,  # Target: <0.10
    'ai_detection_rate': 0.87,  # Target: >0.85
    'paste_detection_rate': 0.96,  # Target: >0.95
    'avg_verification_time_ms': 145,  # Target: <200
    'user_satisfaction': 4.2,  # Target: >4.0/5.0
}
```

---

## Next Steps After Completion

1. **Continuous Improvement**:
   - Collect real-world data monthly
   - Retrain model quarterly
   - Monitor new AI tools (Claude Code, Cursor, etc.)

2. **Feature Expansion**:
   - Add browser fingerprinting
   - Implement user behavioral profiles
   - Cross-session verification

3. **Platform Expansion**:
   - Firefox extension
   - Safari extension
   - Mobile browser support (future)

4. **Research Validation**:
   - Publish methodology
   - Peer review
   - Third-party security audit

---

## Contact & Support

- **GitHub Issues**: [Report bugs or feature requests]
- **Documentation**: See `documentation.md` for architecture details
- **Critical Analysis**: See `CRITICAL_ANALYSIS.md` for deep dive

---

**Remember**: 100% accuracy is impossible. The goal is 95-98% accuracy with <5% false positives. Focus on minimizing harm from false positives (frustrating legitimate users) while maximizing detection of non-human input.

Good luck! 🚀