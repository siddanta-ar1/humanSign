# HumanSign Critical Analysis & Action Plan

**Date**: 2025-01-XX  
**Goal**: Achieve 100% accuracy in distinguishing human typing, AI suggestions, and paste operations

---

## Executive Summary

Your codebase is **well-architected** with a solid foundation:
- ✅ Chrome extension with high-precision keystroke tracking (performance.now())
- ✅ Volume-based detection system that tracks character counts by input method
- ✅ Multi-class ML model (6 classes) trained on synthetic data
- ✅ FastAPI backend with PostgreSQL storage
- ✅ Next.js web app with Tiptap editor

However, **critical gaps prevent 100% accuracy**:
- ❌ ML model trained but NOT USED in verification (only for stats)
- ❌ Detection blind spots for silent AI insertions
- ❌ Volume-based approach is gameable (10% threshold can be exploited)
- ❌ No timing-based anomaly detection despite having all the data
- ❌ Race conditions in multi-layer event tracking

**Current Accuracy Estimate**: ~70-80% (untested on real AI tools)  
**Achievable Target**: 95-98% (100% is theoretically impossible)

---

## Architecture Overview

### Component Flow
```
[Browser Tab]
    ↓ (keydown/keyup/paste/input events)
[Content Script] → captures events with performance.now()
    ↓ (chrome.runtime.sendMessage)
[Background Worker] → batches events, manages session state
    ↓ (HTTP POST)
[FastAPI Server] → processes batches, extracts features
    ↓ (stores in DB)
[PostgreSQL] → sessions + keystrokes tables
    ↓ (verification request)
[Verification Endpoint] → VOLUME-BASED LOGIC (ignores ML!)
    ↓ (returns verdict)
[Client/Web UI] → displays "human_verified" or "paste_detected"
```

---

## Critical Issue #1: ML Model is Unused 🚨

### Location
- `server/app/api/routes/verification.py` lines 104-142

### Problem
```python
# Line 104: Comment says "Shadow ML Inference (For features stats only, NOT for verdict)"
features = feature_extractor.extract_features(full_keyboard_events)
# ML prediction is calculated but IGNORED
```

The system has a trained XGBoost model with 21 timing features:
- Dwell time statistics (avg, std, min, max)
- Flight time statistics
- Burst detection (consecutive fast typing < 50ms)
- Zero timing ratios (indicative of paste/AI)
- Pause patterns
- Key type ratios (backspace, tab, ctrl, symbols)

**But verification uses ONLY volume counts:**
```python
# Current logic (lines 117-147):
if pct_paste > 0.10:
    verdict = "paste_detected"
elif pct_ai > 0.10:
    verdict = "ai_assisted"
else:
    verdict = "human_verified"
```

### Why This Fails
An attacker can:
1. Type 90 chars manually (slow, human-like)
2. AI-generate 9 chars (under 10% threshold)
3. Repeat pattern → infinite AI content while appearing "human"

### Solution
**Implement hybrid scoring that combines:**
- Volume analysis (current approach)
- ML-based timing analysis (already trained!)
- Burst detection (consecutive keys < 8ms)
- Rhythm consistency scoring

---

## Critical Issue #2: Detection Blind Spots

### 2A. Silent AI Insertions

**Location**: `client/src/content/keystroke-tracker.ts` lines 447-509

**Problem**: The extension relies on `input` events to detect AI autocomplete:
```typescript
// Line 456: Only catches inputType patterns
const isSuspiciousType =
    inputEvent.inputType === 'insertReplacementText' ||
    inputEvent.inputType === 'insertFromYank' ||
    inputEvent.inputType === 'insertFromDrop';
```

**Gaps:**
- Browser-native AI tools (e.g., Chrome's built-in writing assistant) may bypass input events
- Direct DOM manipulation by extensions
- ContentEditable elements with custom rendering (Google Docs, Notion)
- Voice-to-text that appears character-by-character

**Evidence in Code**:
```typescript
// Line 330: DOM observer exists but may be too slow
private observeDOM() {
    // Only checks value changes every 200ms
    // Fast AI insertions could complete before detection
}
```

### 2B. Paste Detection Incomplete

**Unhandled scenarios:**
- Drag-and-drop text (only partially covered)
- Context menu "Paste" (right-click)
- Browser autofill
- Extensions that inject text (password managers, grammar tools)

**Current code** (lines 165-207) only handles `ClipboardEvent`:
```typescript
private handlePaste = (event: ClipboardEvent): void => {
    const pastedText = event.clipboardData?.getData('text') || '';
    // What if text appears without ClipboardEvent firing?
}
```

### 2C. Keystroke Timing Not Captured for Paste/AI

**Problem**: When paste or AI events are detected, the system stores:
```typescript
// Line 180-184
this.events.push({
    event_type: 'paste',
    key_code: pastedLength,  // ← Just the volume
    key_char: null,
    client_timestamp: currentTime,
    input_method: 'paste'
});
```

**Missing**: No dwell_time or flight_time for these events, so ML model can't analyze timing anomalies.

---

## Critical Issue #3: Race Conditions in Multi-Layer Tracking

### Problem
The content script attaches listeners in multiple places:

1. **Direct keyboard listeners** (lines 213-243):
   ```typescript
   document.addEventListener('keydown', this.handleKeyDown, ...)
   document.addEventListener('keyup', this.handleKeyUp, ...)
   ```

2. **Input event handler** (line 223):
   ```typescript
   document.addEventListener('input', this.handleInput, ...)
   ```

3. **Paste handler** (line 227):
   ```typescript
   document.addEventListener('paste', this.handlePaste, ...)
   ```

4. **DOM mutation observer** (lines 330-403):
   ```typescript
   this.domObserver = new MutationObserver(...)
   ```

5. **postMessage handler** (line 248):
   ```typescript
   window.addEventListener('message', this.handleWindowMessage)
   ```

### Race Condition Scenarios

**Scenario A**: User types "hello" then pastes "world"
- `keydown` events fire for "h", "e", "l", "l", "o"
- `paste` event fires
- `input` event fires (may trigger AI detection if pasted text is multi-char)
- DOM observer detects text change

**Result**: Same event counted 2-3 times!

**Scenario B**: AI autocomplete accepts suggestion
- AI tool inserts text directly into DOM
- DOM observer detects change → tags as `ai_assistant`
- Browser fires synthetic `input` events for each char
- `handleInput` may tag each char as separate `ai_assistant` event

**Result**: Volume inflated 10x!

### Evidence in Code
Line 451: `handleInput` doesn't check if event already processed:
```typescript
private handleInput = (event: Event): void => {
    if (!this.isTracking) return;
    this.lastInputTime = now(); // Sets timestamp to ignore mutations
    // BUT: What if keydown already fired? Double counting!
```

---

## Critical Issue #4: Synthetic Training Data Mismatch

### Location
`ml/src/generate_synthetic.py`

### Current AI Simulation (lines 186-247)
```python
def generate_ai_assisted(n_samples: int, seed: int = 42):
    # AI-inserted content: very fast (near-zero)
    dwell[start:end] = np.random.uniform(0, 5, n_inserted)
    flight[start:end-1] = np.random.uniform(0, 5, n_inserted - 1)
```

**Assumptions:**
- AI text appears with 0-5ms timing
- User types normally before/after
- Clear boundary between human and AI sections

### Reality Check (Untested!)

**GitHub Copilot**:
- May insert character-by-character with 10-30ms delays (to look human-like)
- Could trigger separate `input` events
- May include "thinking" pause before insertion

**ChatGPT/Claude Autocomplete**:
- Streaming responses (not burst)
- Variable speed based on token generation
- May include formatting characters

**Grammarly**:
- Inline replacements (not appends)
- Simultaneous multi-word corrections
- Uses `textContent` manipulation

**Your model has never seen real AI tools!**

---

## Critical Issue #5: No Timing-Based Verification

### The Paradox
You have all the ingredients for timing analysis:
- ✅ Microsecond-precision timestamps (performance.now())
- ✅ Dwell time calculation (keydown → keyup)
- ✅ Flight time calculation (keyup → next keydown)
- ✅ 21 timing features extracted
- ✅ Trained XGBoost model

**But you don't use them!**

### What's Missing
1. **Burst Detection in Verification**:
   - Code exists in `repro_burst.py` (testing file)
   - Never integrated into verification endpoint
   - Could catch AI sequences (5+ keys with < 8ms timing)

2. **Rhythm Analysis**:
   - Human typing has consistent rhythm (autocorrelation)
   - AI insertions break rhythm
   - Not analyzed in current system

3. **Anomaly Scoring**:
   - No baseline per user
   - No deviation detection
   - No confidence intervals

---

## Path to 100% Accuracy (Realistic: 95-98%)

### Why 100% is Impossible
1. **Determined Attacker**: Can type slowly and use AI sparingly
2. **False Positives**: Fast human typists (200+ WPM) look like AI
3. **Browser Limitations**: Events can be spoofed or missed
4. **AI Evolution**: New tools with human-like timing

### Achievable Goal: 95-98% with Low False Positives

---

## Action Plan

### Phase 1: Fix Critical Gaps (Week 1-2)

#### Task 1.1: Enable ML-Based Verification ⭐ HIGHEST PRIORITY
**File**: `server/app/api/routes/verification.py`

**Changes**:
```python
# Line 104: Replace "Shadow ML" with active verification
if len(keyboard_events) >= 10:
    features = feature_extractor.extract_features(full_keyboard_events)
    feature_array = feature_extractor.features_to_array(features)
    ml_result = ml_inference.predict(feature_array)
    
    # Combine ML with volume analysis
    ml_confidence = ml_result['confidence']
    ml_is_human = ml_result['is_human']
    
    # Hybrid scoring:
    # - If volume shows >10% non-human → fail (strict)
    # - If ML shows AI patterns → warn
    # - Both agree → high confidence
    
    if pct_paste > 0.10 or pct_ai > 0.10:
        final_is_human = False
        final_confidence = max(pct_paste, pct_ai)
    elif not ml_is_human:
        final_is_human = False
        final_confidence = ml_confidence
    else:
        final_is_human = True
        final_confidence = min(pct_human, ml_confidence)
```

**Expected Impact**: +10-15% accuracy

#### Task 1.2: Add Burst Detection
**File**: `server/app/services/feature_extractor.py`

**New Method**:
```python
def detect_ai_bursts(keystrokes: list[ProcessedKeystroke]) -> dict:
    """
    Detect sequences of >5 consecutive keys with extremely fast timing.
    AI signature: dwell < 8ms AND flight < 8ms
    """
    consecutive_fast = 0
    burst_positions = []
    
    for i, k in enumerate(keystrokes):
        dwell = k.dwell_time or 999
        flight = k.flight_time or 999
        
        if dwell < 8.0 and flight < 8.0:
            consecutive_fast += 1
            if consecutive_fast == 5:
                burst_positions.append(i - 4)  # Start of burst
        else:
            consecutive_fast = 0
    
    return {
        'has_burst': len(burst_positions) > 0,
        'burst_count': len(burst_positions),
        'burst_positions': burst_positions,
        'burst_severity': len(burst_positions) / max(len(keystrokes), 1)
    }
```

**Integration**:
Add to verification logic:
```python
burst_analysis = detect_ai_bursts(full_keyboard_events)
if burst_analysis['has_burst'] and burst_analysis['burst_severity'] > 0.05:
    final_is_human = False
    verdict_label = "ai_burst_detected"
```

**Expected Impact**: +5-10% accuracy for AI autocomplete

#### Task 1.3: Fix Race Conditions in Event Tracking
**File**: `client/src/content/keystroke-tracker.ts`

**Changes**:

1. Add event deduplication:
```typescript
private eventCache = new Set<string>();

private isDuplicateEvent(event: KeystrokeEvent): boolean {
    const key = `${event.event_type}-${event.key_code}-${event.client_timestamp}`;
    if (this.eventCache.has(key)) {
        return true;
    }
    this.eventCache.add(key);
    
    // Clear old entries (older than 1 second)
    setTimeout(() => this.eventCache.delete(key), 1000);
    return false;
}
```

2. Priority system:
```typescript
// Priority: Paste > AI > Keyboard
// If paste detected, ignore subsequent input events for 100ms
private ignoredUntil: number = 0;

private handleKeyDown = (event: KeyboardEvent): void => {
    if (now() < this.ignoredUntil) return;
    // ... rest of handler
}
```

**Expected Impact**: Eliminate double counting, +3-5% accuracy

#### Task 1.4: Enhanced AI Detection
**File**: `client/src/content/keystroke-tracker.ts`

**Add to `observeDOM()` method**:
```typescript
// Detect sudden text length changes (AI signature)
private lastTextLength = 0;

const checkTextLengthJump = () => {
    const activeEl = document.activeElement;
    const currentLength = this.getTextLength(activeEl);
    const delta = currentLength - this.lastTextLength;
    
    // If >20 chars appear in <100ms without keyboard events
    const timeSinceLastKey = now() - this.lastInputTime;
    if (delta > 20 && timeSinceLastKey < 100) {
        console.log('[HumanSign] Suspicious text jump detected:', delta, 'chars');
        this.recordSilentAI(delta);
    }
    
    this.lastTextLength = currentLength;
};
```

**Expected Impact**: +5-8% for catching silent AI

### Phase 2: Enhanced ML Model (Week 3-4)

#### Task 2.1: Real-World Data Collection

**Create**: `ml/src/collect_real_data.py`

**Strategy**:
1. Build test harness that uses actual AI tools:
   - GitHub Copilot
   - ChatGPT autocomplete
   - Grammarly
   - Native browser AI

2. Record keystroke patterns:
   - Accept 100 AI suggestions
   - Type 100 paragraphs manually
   - Mix paste operations

3. Label data with ground truth

4. Compare synthetic vs. real patterns:
   ```python
   # Are synthetic AI bursts actually 0-5ms?
   # Or are real AI tools 10-30ms to mimic humans?
   ```

#### Task 2.2: Train LSTM Sequential Model

**Why**: XGBoost sees features in isolation. LSTM can detect:
- Temporal patterns
- Rhythm breaks
- Sequential anomalies

**Architecture**:
```python
# Input: Sequence of (dwell_time, flight_time) pairs
# Output: Probability of human vs AI for each segment

model = Sequential([
    LSTM(64, return_sequences=True),
    LSTM(32),
    Dense(16, activation='relu'),
    Dense(6, activation='softmax')  # 6 classes
])
```

**Expected Impact**: +10-15% accuracy on sequential patterns

#### Task 2.3: Ensemble Model

**Combine**:
- Volume-based (current)
- XGBoost on features
- LSTM on sequences
- Burst detection
- Content analysis

**Weighted voting**:
```python
final_score = (
    0.3 * volume_score +
    0.25 * xgboost_score +
    0.25 * lstm_score +
    0.15 * burst_score +
    0.05 * content_score
)
```

**Expected Impact**: +5-10% through consensus

### Phase 3: System Hardening (Week 5-6)

#### Task 3.1: Cryptographic Proof Chain

**Objective**: Make it impossible to fake keystroke history

**Implementation**:
1. Sign each keystroke batch with HMAC:
```typescript
// In background/index.ts
const signBatch = async (events: KeystrokeEvent[]) => {
    const payload = JSON.stringify(events);
    const key = await crypto.subtle.generateKey(
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return { events, signature, timestamp: now() };
};
```

2. Server validates chronological ordering:
```python
# Reject if timestamps are out of order or have time gaps
def validate_chronology(batches: list) -> bool:
    for i in range(1, len(batches)):
        time_gap = batches[i].timestamp - batches[i-1].timestamp
        if time_gap < 0 or time_gap > 60000:  # 1 min max gap
            return False
    return True
```

#### Task 3.2: User Baseline Profiling

**Concept**: Learn each user's typing characteristics

**Features to track**:
- Average WPM
- Dwell time distribution
- Flight time distribution
- Common key combinations
- Error rate (backspace usage)
- Rhythm autocorrelation

**Implementation**:
```python
# After 10 verified sessions, create user profile
class UserProfile:
    avg_dwell: float
    std_dwell: float
    avg_flight: float
    typical_wpm: float
    
    def is_anomalous(self, session_features) -> bool:
        # Z-score deviation
        z_dwell = abs(session_features.avg_dwell - self.avg_dwell) / self.std_dwell
        z_flight = abs(session_features.avg_flight - self.avg_flight) / self.std_flight
        
        return z_dwell > 3.0 or z_flight > 3.0
```

**Expected Impact**: +5% accuracy for returning users

#### Task 3.3: Real-Time Monitoring

**Add**: Live session analysis endpoint

```python
@router.post("/verify/live")
async def verify_live_session(session_id: UUID):
    """
    Run verification on partial session (for live feedback).
    """
    keystrokes = await keystroke_service.get_session_keystrokes(session_id)
    
    # Run analysis on partial data
    # Update UI with real-time confidence score
    
    return {
        "current_confidence": 0.85,
        "alerts": ["Suspicious burst at position 145"],
        "recommendation": "continue_monitoring"
    }
```

**UI Integration**: Show live "Human Score" meter in extension popup

---

## Testing Strategy

### Test Suite 1: Known AI Tools
- [ ] GitHub Copilot (100 acceptances)
- [ ] ChatGPT autocomplete (100 suggestions)
- [ ] Grammarly corrections (100 edits)
- [ ] Claude Code (50 insertions)
- [ ] Browser native AI (if available)

**Success Criteria**: >95% detection rate

### Test Suite 2: Human Typing Variants
- [ ] Fast typist (150+ WPM)
- [ ] Slow typist (30 WPM)
- [ ] Non-native speaker (high error rate)
- [ ] Coding patterns (lots of symbols)
- [ ] Mobile typing (if supported)

**Success Criteria**: <5% false positive rate

### Test Suite 3: Adversarial Attacks
- [ ] Type 90 chars + paste 9 chars (under threshold)
- [ ] Use AI with manual pauses inserted
- [ ] Replay captured human keystrokes
- [ ] Gradually increase AI usage

**Success Criteria**: Detect >80% of sophisticated attacks

### Test Suite 4: Edge Cases
- [ ] Very short sessions (<50 chars)
- [ ] Very long sessions (>10k chars)
- [ ] Multiple paste operations
- [ ] Mixed languages
- [ ] Special characters and formatting

---

## Metrics Dashboard

### What to Track

1. **Detection Accuracy**:
   - True Positive Rate (AI detected as AI)
   - False Positive Rate (Human flagged as AI)
   - Precision / Recall / F1

2. **Volume Analysis**:
   - % Human typed
   - % Pasted
   - % AI assisted

3. **Timing Analysis**:
   - Average dwell time
   - Average flight time
   - Burst count
   - Rhythm consistency score

4. **Model Performance**:
   - XGBoost confidence
   - LSTM confidence (if implemented)
   - Ensemble agreement rate

5. **User Experience**:
   - False alarm rate
   - Time to verification
   - User trust score

---

## Known Limitations (Be Honest)

### Fundamental Limits

1. **Spoofing is Possible**:
   - A sophisticated attacker can replay recorded human keystrokes
   - Browser extensions can inject fake events
   - System events can be manipulated

2. **Fast Humans Look Like AI**:
   - Professional typists (200+ WPM) have very low dwell/flight times
   - May trigger burst detection

3. **Browser Sandboxing**:
   - Chrome extensions can't access all page content (iframes, shadow DOM)
   - Some editors use custom rendering (Google Docs canvas)

4. **Privacy Concerns**:
   - Keystroke timing is a biometric
   - Could potentially identify individuals
   - GDPR/privacy law compliance needed

### Mitigation Strategies

1. **Multi-Factor Verification**:
   - Combine keystroke + content analysis + session history
   - Require video recording for high-stakes scenarios
   - Use CAPTCHA challenges when suspicious

2. **Adaptive Thresholds**:
   - Adjust sensitivity based on context
   - Higher tolerance for coding (lots of symbols)
   - Stricter for essay writing

3. **User Education**:
   - Explain limitations clearly
   - Don't claim "100% accuracy"
   - Provide appeal process for false positives

---

## Immediate Next Steps (This Week)

### Day 1-2: Enable ML Verification
- [ ] Modify `verification.py` to use ML predictions
- [ ] Add burst detection function
- [ ] Test on synthetic data

### Day 3-4: Fix Extension Race Conditions
- [ ] Implement event deduplication
- [ ] Add priority system for overlapping events
- [ ] Test with rapid typing + paste

### Day 5: Real-World Testing
- [ ] Install GitHub Copilot
- [ ] Record 50 AI autocomplete events
- [ ] Check if current system detects them
- [ ] Document actual timing patterns

### Day 6-7: Initial Accuracy Measurement
- [ ] Create test dataset (100 human + 100 AI + 100 paste)
- [ ] Run through verification endpoint
- [ ] Calculate precision/recall
- [ ] Identify failure modes

---

## Success Criteria

### Minimum Viable Accuracy (MVP)
- ✅ 90% detection of pure paste operations
- ✅ 85% detection of AI autocomplete (known tools)
- ✅ <10% false positive rate on human typing
- ✅ No crashes or data loss

### Target Accuracy (Production Ready)
- ✅ 95% detection of paste operations
- ✅ 93% detection of AI autocomplete
- ✅ 90% detection of hybrid attacks (mixed AI + paste)
- ✅ <5% false positive rate
- ✅ <3% false positive rate for returning users (with baseline)

### Stretch Goal (Research Grade)
- ✅ 98% detection across all scenarios
- ✅ <2% false positive rate
- ✅ Real-time verification (<100ms latency)
- ✅ Resistance to adversarial attacks
- ✅ Published validation study

---

## Conclusion

Your HumanSign project has **excellent foundations** but is currently using only ~30% of its potential. The ML model exists but isn't used. The timing data is collected but ignored. The detection system has gaps.

**The good news**: All the pieces are there. You just need to:
1. Connect the ML model to verification
2. Fix the race conditions
3. Test against real AI tools
4. Iterate on thresholds

**Realistic Timeline**:
- Week 1-2: Fix critical gaps → 85% accuracy
- Week 3-4: Enhanced ML → 92% accuracy
- Week 5-6: System hardening → 95% accuracy
- Ongoing: Real-world testing and refinement

**100% is impossible**, but **95-98% with low false positives is achievable** with the action plan above.

The key is to shift from "volume-only" to "hybrid multi-signal" detection that leverages all the data you're already collecting.

Good luck! 🚀