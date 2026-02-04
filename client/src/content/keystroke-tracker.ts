/**
 * KeystrokeTracker - Captures keystroke events with high-precision timing.
 *
 * Uses performance.now() for sub-millisecond accuracy.
 * Buffers events and sends them to background worker in batches.
 * Also tracks paste events to detect copy-paste behavior.
 */

import type {
  KeystrokeEvent,
  PasteEvent,
  ExtensionMessage,
  ExtensionResponse,
  Session,
} from "../types";
import { now, throttle } from "../utils/timing";

// Configuration
const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 500;
const MIN_FLUSH_SIZE = 10;

class KeystrokeTracker {
  private events: KeystrokeEvent[] = [];
  private pasteEvents: PasteEvent[] = [];
  private sessionId: string | null = null;
  private batchSequence = 0;
  private isTracking = false;
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastFlushTime = 0;
  private lastInputTime = 0; // Track last input event to debounce mutations
  private totalTypedChars = 0;
  private totalPastedChars = 0;

  // AI detection state - CRITICAL for accurate detection
  private aiInsertInProgress = false;
  private aiInsertIgnoreUntil = 0;
  private lastAiInsertLength = 0;

  /**
   * Start tracking keystrokes.
   */
  async start(): Promise<void> {
    if (this.isTracking) {
      return;
    }

    // Optimistic tracking: Start capturing immediately to avoid race conditions
    this.isTracking = true;
    this.attachListeners();

    try {
      // Request session from background worker
      const response = await this.sendMessage<Session>({
        type: "START_SESSION",
        payload: { domain: window.location.hostname },
      });

      if (response.success) {
        this.sessionId = response.data.id;
        console.log(
          "[HumanSign] Tracking started for session:",
          this.sessionId,
        );
        // Trigger an immediate flush in case we buffered events while waiting
        this.scheduleFlush();
      } else {
        console.error("[HumanSign] Failed to start session:", response.error);
        // Revert state on failure
        this.stopTrackingState();
      }
    } catch (error) {
      console.error("[HumanSign] Error starting tracking:", error);
      this.stopTrackingState();
    }
  }

  private stopTrackingState(): void {
    this.isTracking = false;
    this.sessionId = null;
    this.detachListeners();
    this.events = [];
  }

  /**
   * Stop tracking keystrokes.
   */
  async stop(): Promise<void> {
    if (!this.isTracking || !this.sessionId) {
      return;
    }

    this.detachListeners();
    await this.flush();

    try {
      await this.sendMessage({
        type: "END_SESSION",
        payload: { session_id: this.sessionId },
      });
      console.log("[HumanSign] Session ended:", this.sessionId);
    } catch (error) {
      console.error("[HumanSign] Error ending session:", error);
    }

    this.reset();
  }

  /**
   * Request verification for current session.
   */
  async verify(): Promise<void> {
    if (!this.sessionId) {
      console.error("[HumanSign] No active session to verify");
      return;
    }

    try {
      const response = await this.sendMessage({
        type: "VERIFY_SESSION",
        payload: { session_id: this.sessionId },
      });

      if (response.success) {
        console.log("[HumanSign] Verification result:", response.data);
      } else {
        console.error("[HumanSign] Verification failed:", response.error);
      }
    } catch (error) {
      console.error("[HumanSign] Error verifying session:", error);
    }
  }

  /**
   * Handle keydown event.
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isTracking) return;

    const keystrokeEvent: KeystrokeEvent = {
      event_type: "keydown",
      key_code: event.keyCode,
      key_char: event.key.length === 1 ? event.key : null,
      client_timestamp: now(),
    };

    // Track typed characters (printable keys only)
    if (event.key.length === 1) {
      this.totalTypedChars++;
    }

    this.events.push(keystrokeEvent);
    this.scheduleFlush();
  };

  /**
   * Handle keyup event.
   */
  private handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.isTracking) return;

    const keystrokeEvent: KeystrokeEvent = {
      event_type: "keyup",
      key_code: event.keyCode,
      key_char: event.key.length === 1 ? event.key : null,
      client_timestamp: now(),
    };

    this.events.push(keystrokeEvent);
    this.scheduleFlush();
  };

  /**
   * Handle paste event - ONLY for actual clipboard paste (Ctrl+V)
   * CRITICAL: Do NOT catch AI insertions here!
   */
  private handlePaste = (event: ClipboardEvent): void => {
    if (!this.isTracking || !this.sessionId) return;

    const currentTime = now();

    // CRITICAL: If AI insert is in progress or recently happened, IGNORE this event
    // AI insertions via Tab should NOT be counted as paste
    if (this.aiInsertInProgress || currentTime < this.aiInsertIgnoreUntil) {
      console.log(
        "[HumanSign] Paste event IGNORED - AI insert in progress or recent",
      );
      return;
    }

    const pastedText = event.clipboardData?.getData("text") || "";
    const pastedLength = pastedText.length;

    if (pastedLength > 0) {
      this.totalPastedChars += pastedLength;

      // DETERMINISTIC TAGGING:
      // This is a REAL paste (Ctrl+V), not AI suggestion
      this.events.push({
        event_type: "paste",
        key_code: pastedLength,
        key_char: null,
        client_timestamp: currentTime,
        input_method: "paste",
      });

      const pasteEvent: PasteEvent = {
        event_type: "paste",
        pasted_length: pastedLength,
        client_timestamp: currentTime,
      };

      this.pasteEvents.push(pasteEvent);

      // Send paste event immediately (don't batch)
      this.sendMessage({
        type: "PASTE_EVENT",
        payload: {
          session_id: this.sessionId,
          event: pasteEvent,
        },
      }).catch(console.error);

      this.scheduleFlush();
      console.log(
        `[HumanSign] REAL Paste detected (Ctrl+V): ${pastedLength} chars`,
      );
    }
  };

  /**
   * Attach keyboard event listeners.
   * Uses multiple strategies to capture keystrokes from various editors.
   */
  private attachListeners(): void {
    // Strategy 1: Window-level capture (highest priority)
    window.addEventListener("keydown", this.handleKeyDown, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keyup", this.handleKeyUp, {
      capture: true,
      passive: true,
    });

    // Strategy 2: Document-level capture (fallback)
    document.addEventListener("keydown", this.handleKeyDown, {
      capture: true,
      passive: true,
    });
    document.addEventListener("keyup", this.handleKeyUp, {
      capture: true,
      passive: true,
    });

    // Strategy 3: Monitor input events for editors that don't fire keyboard events
    document.addEventListener("input", this.handleInput, {
      capture: true,
      passive: true,
    });
    document.addEventListener("beforeinput", this.handleInput, {
      capture: true,
      passive: true,
    });

    // Strategy 4: PASTE EVENT DETECTION (critical for AI content detection)
    document.addEventListener("paste", this.handlePaste, { capture: true });
    window.addEventListener("paste", this.handlePaste, { capture: true });

    // Strategy 5: Window Message for AI Insertion (Robust across worlds)
    window.addEventListener("message", this.handleWindowMessage, {
      capture: true,
    });

    // Strategy 6: Target ProseMirror/Tiptap/contenteditable elements DIRECTLY
    this.attachToContentEditables();

    // Safety: Flush on unload
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    // Watch for dynamically added editors (React/Next.js apps)
    this.observeDOM();

    console.log("[HumanSign] Keystroke and paste listeners attached");
  }

  /**
   * Handle explicit AI insertion via window.postMessage
   */
  private handleWindowMessage = (event: MessageEvent): void => {
    // Security: Only accept messages from same window
    if (event.source !== window) return;

    if (event.data?.type === "humanSign:aiInsert" && event.data?.text) {
      this.synthesizeAiBurst(event.data.text);
    }
  };

  /**
   * Handle AI Assistant Insert (e.g. OpenRouter, Tab completion)
   * CRITICAL: This is the ONLY place AI should be detected!
   */
  private synthesizeAiBurst(text: string): void {
    const currentTime = now();

    // Set flags to prevent other handlers from catching this as paste/input
    this.aiInsertInProgress = true;
    this.lastAiInsertLength = text.length;
    this.aiInsertIgnoreUntil = currentTime + 500; // Ignore other handlers for 500ms

    console.log(
      "[HumanSign] AI Insert Detected (via postMessage):",
      text.length,
      "chars - BLOCKING other handlers for 500ms",
    );

    // SYNTHESIZE ACTUAL BURST PATTERN FOR ML MODEL DETECTION
    // Create fast keystrokes (3-5ms timing) to trigger burst detection
    const chars = text.split("");
    let timestamp = currentTime;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const keyCode = char.charCodeAt(0);

      // AI timing signature: 3-5ms dwell and flight times
      const dwellTime = 3 + Math.random() * 2; // 3-5ms
      const flightTime = 2 + Math.random() * 2; // 2-4ms

      // Keydown event
      this.events.push({
        event_type: "keydown",
        key_code: keyCode,
        key_char: char,
        client_timestamp: timestamp,
        input_method: "ai_assistant",
      });

      // Keyup event (after dwell time)
      this.events.push({
        event_type: "keyup",
        key_code: keyCode,
        key_char: char,
        client_timestamp: timestamp + dwellTime,
        input_method: "ai_assistant",
      });

      // Move to next character (add flight time)
      timestamp += dwellTime + flightTime;
    }

    // ALSO add the volume marker event (event_type=4) for volume tracking
    this.events.push({
      event_type: "ai_assistant",
      key_code: text.length,
      key_char: null,
      client_timestamp: timestamp,
      input_method: "ai_assistant",
    });

    // Count as foreign content for stats
    this.totalPastedChars += text.length;

    console.log(
      `[HumanSign] Synthesized ${chars.length} AI keystrokes with 3-5ms timing (BURST PATTERN)`,
    );
    this.scheduleFlush();

    // Reset flag after a short delay
    setTimeout(() => {
      this.aiInsertInProgress = false;
    }, 100);
  }

  private handleAiInsert = (event: CustomEvent): void => {
    // Deprecated
  };

  /**
   * Attach listeners to all contenteditable elements (ProseMirror, Tiptap, etc.)
   */
  private attachToContentEditables(): void {
    // Target ProseMirror editors
    const proseMirrors = document.querySelectorAll(".ProseMirror");
    proseMirrors.forEach((el) => {
      el.addEventListener("keydown", this.handleKeyDown as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("keyup", this.handleKeyUp as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("paste", this.handlePaste as EventListener, {
        capture: true,
      });
      el.addEventListener(
        "humanSign:aiInsert",
        this.handleAiInsert as EventListener,
        { capture: true },
      ); // Also attach here
      console.log("[HumanSign] Attached to ProseMirror editor");
    });

    // Target Monaco editors
    const monacos = document.querySelectorAll(
      ".monaco-editor textarea, .monaco-editor .inputarea",
    );
    monacos.forEach((el) => {
      el.addEventListener("keydown", this.handleKeyDown as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("keyup", this.handleKeyUp as EventListener, {
        capture: true,
        passive: true,
      });
      // Monaco captures input aggressively, we rely on window/document capture for custom events often, but add safely:
      el.addEventListener(
        "humanSign:aiInsert",
        this.handleAiInsert as EventListener,
        { capture: true },
      );
      console.log("[HumanSign] Attached to Monaco editor");
    });

    // Target generic contenteditable
    const editables = document.querySelectorAll('[contenteditable="true"]');
    editables.forEach((el) => {
      el.addEventListener("keydown", this.handleKeyDown as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("keyup", this.handleKeyUp as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("paste", this.handlePaste as EventListener, {
        capture: true,
      });
    });

    // Target textareas and inputs
    const inputs = document.querySelectorAll('textarea, input[type="text"]');
    inputs.forEach((el) => {
      el.addEventListener("keydown", this.handleKeyDown as EventListener, {
        capture: true,
        passive: true,
      });
      el.addEventListener("keyup", this.handleKeyUp as EventListener, {
        capture: true,
        passive: true,
      });
    });
  }

  private domObserver: MutationObserver | null = null;

  /**
   * Observe DOM for dynamically added editors ONLY
   * REMOVED: AI detection via DOM mutations (was causing false positives)
   * AI is now ONLY detected via explicit postMessage from editor
   */
  private observeDOM(): void {
    if (this.domObserver) return;

    this.domObserver = new MutationObserver((mutations) => {
      // ONLY use DOM observer to attach listeners to new editors
      // DO NOT detect AI via DOM mutations - too many false positives!

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const addedNodes = Array.from(mutation.addedNodes);
          for (const node of addedNodes) {
            if (node instanceof HTMLElement) {
              // Attach listeners to new editors (ProseMirror, contenteditable)
              if (
                node.classList?.contains("ProseMirror") ||
                node.getAttribute("contenteditable") === "true"
              ) {
                node.addEventListener(
                  "keydown",
                  this.handleKeyDown as EventListener,
                  { capture: true, passive: true },
                );
                node.addEventListener(
                  "keyup",
                  this.handleKeyUp as EventListener,
                  { capture: true, passive: true },
                );
                node.addEventListener(
                  "paste",
                  this.handlePaste as EventListener,
                  { capture: true },
                );
                console.log("[HumanSign] Attached to dynamically added editor");
              }
              // Check descendants
              const proseMirror = node.querySelector?.(".ProseMirror");
              if (proseMirror) {
                proseMirror.addEventListener(
                  "keydown",
                  this.handleKeyDown as EventListener,
                  { capture: true, passive: true },
                );
                proseMirror.addEventListener(
                  "keyup",
                  this.handleKeyUp as EventListener,
                  { capture: true, passive: true },
                );
                proseMirror.addEventListener(
                  "paste",
                  this.handlePaste as EventListener,
                  { capture: true },
                );
                console.log(
                  "[HumanSign] Attached to ProseMirror in added node",
                );
              }
            }
          }
        }
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      // REMOVED: characterData observation - was causing false AI detection
    });
  }

  // REMOVED: recordSilentAI - no longer detecting AI via DOM mutations
  // AI is now ONLY detected via explicit postMessage from editor

  /**
   * Detach keyboard event listeners.
   */
  private detachListeners(): void {
    window.removeEventListener("keydown", this.handleKeyDown, {
      capture: true,
    });
    window.removeEventListener("keyup", this.handleKeyUp, { capture: true });
    document.removeEventListener("keydown", this.handleKeyDown, {
      capture: true,
    });
    document.removeEventListener("keyup", this.handleKeyUp, { capture: true });
    document.removeEventListener("input", this.handleInput, { capture: true });
    document.removeEventListener("beforeinput", this.handleInput, {
      capture: true,
    });
    document.removeEventListener("paste", this.handlePaste, { capture: true });
    window.removeEventListener("paste", this.handlePaste, { capture: true });

    // Remove message listener
    window.removeEventListener("message", this.handleWindowMessage, {
      capture: true,
    });

    this.attachToContentEditables = () => {
      /* no-op during tracking */
    }; // Simplified cleanup for custom strategy

    // Clean up DOM observer
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }

    console.log("[HumanSign] Keystroke and paste listeners detached");
  }

  /**
   * Handle input event (fallback for editors)
   * CRITICAL: Do NOT detect AI here - only via postMessage!
   */
  private handleInput = (event: Event): void => {
    if (!this.isTracking) return;

    const currentTime = now();
    this.lastInputTime = currentTime;

    // CRITICAL: If AI insert is in progress or recently happened, IGNORE this event
    // This prevents double-counting AI as both AI and paste
    if (this.aiInsertInProgress || currentTime < this.aiInsertIgnoreUntil) {
      console.log(
        "[HumanSign] Input event IGNORED - AI insert in progress or recent",
      );
      return;
    }

    const inputEvent = event as InputEvent;
    const rawText = inputEvent.data || "";

    // REMOVED: Aggressive AI detection via input events
    // AI is now ONLY detected via explicit postMessage from editor
    // This prevents false positives when AI suggestion appears but isn't accepted

    // Only handle single character input (genuine human typing)
    if (inputEvent.data && inputEvent.data.length === 1) {
      const keystrokeEvent: KeystrokeEvent = {
        event_type: "keydown",
        key_code: inputEvent.data.charCodeAt(0),
        key_char: inputEvent.data,
        client_timestamp: currentTime,
      };
      this.events.push(keystrokeEvent);
      this.totalTypedChars++;

      // Add synthetic keyup
      const keyupEvent: KeystrokeEvent = {
        event_type: "keyup",
        key_code: inputEvent.data.charCodeAt(0),
        key_char: inputEvent.data,
        client_timestamp: currentTime + 50, // Approximate keyup delay
      };
      this.events.push(keyupEvent);

      this.scheduleFlush();
    }
    // Multi-char input without AI flag - could be autocomplete from OS/browser
    // But we don't flag it as AI since we can't be sure
    // Only the explicit postMessage from editor is trusted
  };

  /**
   * Handle tab close/navigation.
   */
  private handleBeforeUnload = (): void => {
    void this.flush(true);
  };

  /**
   * Schedule a flush of buffered events.
   */
  private scheduleFlush(): void {
    // Immediate flush if buffer is full
    if (this.events.length >= BATCH_SIZE) {
      void this.flush();
      return;
    }

    // Throttled flush for smaller batches
    if (this.flushTimeoutId === null) {
      this.flushTimeoutId = setTimeout(() => {
        void this.flush();
        this.flushTimeoutId = null;
      }, FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Flush buffered events to background worker.
   * @param force - If true, ignores MIN_FLUSH_SIZE check
   */
  private async flush(force: boolean = false): Promise<void> {
    if (!this.sessionId || this.events.length === 0) {
      return;
    }

    // Only enforce min size if not forcing
    if (!force && this.events.length < MIN_FLUSH_SIZE) {
      return;
    }

    const eventsToSend = this.events.slice(0, BATCH_SIZE);
    this.events = this.events.slice(BATCH_SIZE);

    try {
      await this.sendMessage({
        type: "KEYSTROKE_BATCH",
        payload: {
          session_id: this.sessionId,
          events: eventsToSend,
          batch_sequence: this.batchSequence++,
        },
      });
      this.lastFlushTime = now();

      // If we forced a flush and there are still events left (unlikely given slice logic loop, but possible), flush again?
      // Actually slice takes BATCH_SIZE. If we have > BATCH_SIZE, we might leave some.
      // On unload we probably only care about one batch or loop.
      // Loop for unload is risky (might be killed). One batch is better than nothing.
    } catch (error) {
      // Re-add events to buffer on failure
      this.events = [...eventsToSend, ...this.events];
      console.error("[HumanSign] Failed to flush events:", error);
    }
  }

  /**
   * Send message to background worker.
   */
  private sendMessage<T>(
    message: ExtensionMessage,
  ): Promise<ExtensionResponse<T>> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response: ExtensionResponse<T>) => {
        resolve(
          response ?? { success: false, error: "No response from background" },
        );
      });
    });
  }

  /**
   * Reset tracker state.
   */
  private reset(): void {
    this.events = [];
    this.pasteEvents = [];
    this.sessionId = null;
    this.batchSequence = 0;
    this.isTracking = false;
    this.totalTypedChars = 0;
    this.totalPastedChars = 0;
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }
  }

  /**
   * Get current tracking status.
   */
  get status(): {
    isTracking: boolean;
    sessionId: string | null;
    bufferedEvents: number;
    typedChars: number;
    pastedChars: number;
    pasteRatio: number;
  } {
    const total = this.totalTypedChars + this.totalPastedChars;
    return {
      isTracking: this.isTracking,
      sessionId: this.sessionId,
      bufferedEvents: this.events.length,
      typedChars: this.totalTypedChars,
      pastedChars: this.totalPastedChars,
      pasteRatio: total > 0 ? this.totalPastedChars / total : 0,
    };
  }
}

// Export singleton instance
export const keystrokeTracker = new KeystrokeTracker();
