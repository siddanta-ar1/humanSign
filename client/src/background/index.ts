/**
 * Background service worker.
 *
 * Handles messages from content scripts, popup, and communicates with the API.
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  KeystrokeEvent,
  PasteEvent,
} from "../types";
import {
  startSession,
  endSession,
  sendKeystrokeBatch,
  verifySession,
  verifyCombined,
} from "./api-client";
import { createZip } from "./zip-creator";

// Session state
interface SessionState {
  sessionId: string | null;
  domain: string | null;
  keystrokes: KeystrokeEvent[];
  pasteEvents: PasteEvent[];
  totalTypedChars: number;
  totalPastedChars: number; // Actual clipboard paste (Ctrl+V)
  totalAiChars: number; // AI assistant insertions
  startTime: number | null;
  isRecording: boolean;
  signatureCount: number;
  lastVerification: {
    class_label: string;
    verdict?: string;
    confidence: number;
    is_human: boolean;
  } | null;
}

const state: SessionState = {
  sessionId: null,
  domain: null,
  keystrokes: [],
  pasteEvents: [],
  totalTypedChars: 0,
  totalPastedChars: 0,
  totalAiChars: 0,
  startTime: null,
  isRecording: false,
  signatureCount: 0,
  lastVerification: null,
};

// State Persistence Strategy for Manifest V3 Service Worker
const restoreState = async () => {
  try {
    const stored = await chrome.storage.session.get("sessionState");
    if (stored.sessionState) {
      const s = stored.sessionState;
      state.sessionId = s.sessionId;
      state.domain = s.domain;
      state.keystrokes = s.keystrokes || [];
      state.pasteEvents = s.pasteEvents || [];
      state.totalTypedChars = s.totalTypedChars || 0;
      state.totalPastedChars = s.totalPastedChars || 0;
      state.totalAiChars = s.totalAiChars || 0;
      state.startTime = s.startTime;
      state.isRecording = s.isRecording;
      state.signatureCount = s.signatureCount;
      state.lastVerification = s.lastVerification;
      console.log(
        "[HumanSign Background] State restored for session:",
        state.sessionId,
      );
    }
  } catch (e) {
    console.warn("Failed to restore state:", e);
  }
};

const saveState = async () => {
  try {
    await chrome.storage.session.set({ sessionState: state });
  } catch (e) {
    console.warn("Failed to save state:", e);
  }
};

restoreState();

// Calculate stats from keystrokes
function calculateStats() {
  const events = state.keystrokes;
  const keystrokeCount = events.filter(
    (e) => e.event_type === "keydown",
  ).length;

  // Calculate dwell times (keydown to keyup for same key)
  const dwellTimes: number[] = [];
  const flightTimes: number[] = [];

  let lastKeyup = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.event_type === "keydown") {
      // Find matching keyup
      for (let j = i + 1; j < events.length; j++) {
        if (
          events[j].event_type === "keyup" &&
          events[j].key_code === e.key_code
        ) {
          dwellTimes.push(events[j].client_timestamp - e.client_timestamp);
          break;
        }
      }
      // Flight time from last keyup
      if (lastKeyup > 0) {
        flightTimes.push(e.client_timestamp - lastKeyup);
      }
    } else if (e.event_type === "keyup") {
      lastKeyup = e.client_timestamp;
    }
  }

  const avgDwell =
    dwellTimes.length > 0
      ? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length
      : 0;
  const avgFlight =
    flightTimes.length > 0
      ? flightTimes.reduce((a, b) => a + b, 0) / flightTimes.length
      : 0;

  // Calculate WPM (rough estimate: 5 chars = 1 word)
  const duration = state.startTime
    ? (Date.now() - state.startTime) / 1000 / 60
    : 0;
  const wpm = duration > 0 ? keystrokeCount / 5 / duration : 0;

  // Calculate ratios separately for paste and AI (CRITICAL for accurate detection)
  const totalForeignChars = state.totalPastedChars + state.totalAiChars;
  const totalChars = state.totalTypedChars + totalForeignChars;
  const pasteRatio = totalChars > 0 ? state.totalPastedChars / totalChars : 0;
  const aiRatio = totalChars > 0 ? state.totalAiChars / totalChars : 0;
  const pasteCount = state.pasteEvents.length;

  // Real-time verdict for popup display with smooth transitions
  let currentVerdict: string;
  let currentConfidence: number;

  // Determine verdict based on available data
  if (totalChars === 0 && keystrokeCount === 0) {
    // No data yet - waiting state
    currentVerdict = "waiting";
    currentConfidence = 0;
  } else if (totalChars < 20) {
    // Not enough data - show progress but indicate analyzing
    currentVerdict = "waiting";
    currentConfidence = Math.min(totalChars / 20, 0.9); // Progress toward threshold
  } else {
    // Enough data - calculate verdict
    const pctHuman = state.totalTypedChars / totalChars;
    const pctPaste = state.totalPastedChars / totalChars;
    const pctAi = state.totalAiChars / totalChars;

    // Priority: Paste > AI > Human
    // This ensures paste is detected distinctly from AI assistance
    if (pctPaste > 0.1) {
      // Clipboard paste detected (Ctrl+V)
      currentVerdict = pctPaste > 0.5 ? "paste" : "paste_detected";
      currentConfidence = Math.min(0.5 + pctPaste * 0.5, 0.99);
    } else if (pctAi > 0.1) {
      // AI assistant content detected
      currentVerdict = "ai_assisted";
      currentConfidence = Math.min(0.5 + pctAi * 0.5, 0.99);
    } else if (pctHuman >= 0.9) {
      // Verified human typing
      currentVerdict = "human_organic";
      currentConfidence = Math.min(0.7 + pctHuman * 0.3, 0.99);
    } else {
      // Mixed or uncertain - use last verification if available
      currentVerdict = state.lastVerification?.class_label || "unknown";
      currentConfidence = state.lastVerification?.confidence || 0.5;
    }
  }

  return {
    keystrokeCount,
    avgDwell,
    avgFlight,
    wpm,
    sessionId: state.sessionId,
    isRecording: state.isRecording,
    signatureCount: state.signatureCount,
    dwellTimes,
    flightTimes,
    // Paste and AI detection metrics (separate tracking)
    totalTypedChars: state.totalTypedChars,
    totalPastedChars: state.totalPastedChars,
    totalAiChars: state.totalAiChars,
    pasteRatio,
    aiRatio,
    pasteCount,
    // Real-time verdict
    currentVerdict,
    currentConfidence,
  };
}

/**
 * Handle messages from content scripts and popup.
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage | { type: string; [key: string]: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse | unknown) => void,
  ): boolean => {
    // Ensure state is restored before processing (crucial if SW just woke up)
    const process = async () => {
      if (!state.sessionId) await restoreState();
      return handleMessage(message);
    };

    process()
      .then(sendResponse)
      .catch((error) => {
        console.error("[HumanSign Background] Error:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });

    // Return true to indicate async response
    return true;
  },
);

/**
 * Process incoming message.
 */
async function handleMessage(
  message: ExtensionMessage | { type: string; [key: string]: unknown },
): Promise<ExtensionResponse | unknown> {
  switch (message.type) {
    case "START_SESSION": {
      const payload = (message as ExtensionMessage).payload as {
        domain: string;
      };
      try {
        const session = await startSession(payload.domain);
        state.sessionId = session.id;
        state.domain = payload.domain;
        state.startTime = Date.now();
        state.isRecording = true;
        state.keystrokes = [];
        state.pasteEvents = [];
        state.totalTypedChars = 0;
        state.totalPastedChars = 0;
        await saveState();
        return { success: true, data: session };
      } catch {
        // Fallback: create local session
        state.sessionId = crypto.randomUUID();
        state.domain = payload.domain;
        state.startTime = Date.now();
        state.isRecording = true;
        state.keystrokes = [];
        state.pasteEvents = [];
        state.totalTypedChars = 0;
        state.totalPastedChars = 0;
        await saveState();
        return { success: true, data: { id: state.sessionId } };
      }
    }

    case "END_SESSION": {
      const payload = (message as ExtensionMessage).payload as {
        session_id: string;
      };
      state.isRecording = false;
      await saveState();
      try {
        const session = await endSession(payload.session_id);
        return { success: true, data: session };
      } catch {
        return { success: true, data: { ended: true } };
      }
    }

    case "KEYSTROKE_BATCH": {
      const payload = (message as ExtensionMessage).payload;
      if ("events" in payload) {
        const batch = payload as {
          session_id: string;
          events: KeystrokeEvent[];
          batch_sequence: number;
        };
        state.keystrokes.push(...batch.events);

        // Track typed vs AI vs paste characters in real-time
        // CRITICAL: Separate AI from paste for accurate detection
        batch.events.forEach((e) => {
          if (
            e.event_type === "keydown" &&
            e.key_char &&
            e.input_method !== "ai_assistant"
          ) {
            // Human typed character
            state.totalTypedChars++;
          } else if (e.event_type === "ai_assistant") {
            // AI volume marker ONLY (not individual AI keystrokes)
            // key_code contains the total character count
            const aiChars = e.key_code || 1;
            // Count as AI chars, NOT paste chars
            state.totalAiChars += aiChars;
          }
          // NOTE: Individual AI keystrokes (keydown with input_method="ai_assistant")
          // are NOT counted here - they're only for timing/burst detection
          // The volume marker event_type="ai_assistant" has the correct count
        });

        // Calculate real-time verification state
        const totalForeign = state.totalPastedChars + state.totalAiChars;
        const totalChars = state.totalTypedChars + totalForeign;
        if (totalChars > 0) {
          const pctHuman = state.totalTypedChars / totalChars;
          const pctPaste = state.totalPastedChars / totalChars;
          const pctAI = state.totalAiChars / totalChars;

          // Real-time verdict based on volume - prioritize paste over AI
          if (pctPaste > 0.1) {
            // Clipboard paste detected
            state.lastVerification = {
              class_label: pctPaste > 0.5 ? "paste" : "paste_detected",
              verdict: "paste_detected",
              confidence: pctPaste,
              is_human: false,
            };
            await chrome.action.setBadgeText({ text: "📋" });
            await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
          } else if (pctAI > 0.1) {
            // AI assistant content
            state.lastVerification = {
              class_label: "ai_assisted",
              verdict: "ai_assisted",
              confidence: pctAI,
              is_human: false,
            };
            await chrome.action.setBadgeText({ text: "🤖" });
            await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
          } else if (pctHuman >= 0.9) {
            state.lastVerification = {
              class_label: "human_organic",
              verdict: "human_verified",
              confidence: pctHuman,
              is_human: true,
            };
            await chrome.action.setBadgeText({ text: "✓" });
            await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
          }
        }

        await saveState();

        try {
          const result = await sendKeystrokeBatch(batch);
          return { success: true, data: result };
        } catch {
          return { success: true, data: { buffered: true } };
        }
      }
      return { success: false, error: "Invalid batch" };
    }

    case "PASTE_EVENT": {
      const payload = (message as ExtensionMessage).payload as {
        session_id: string;
        event: PasteEvent;
      };
      state.pasteEvents.push(payload.event);
      state.totalPastedChars += payload.event.pasted_length;
      console.log(
        `[HumanSign] Paste recorded: ${payload.event.pasted_length} chars (total paste: ${state.totalPastedChars}, total AI: ${state.totalAiChars})`,
      );

      // Update real-time verdict - include all foreign chars in total
      const totalForeign = state.totalPastedChars + state.totalAiChars;
      const totalChars = state.totalTypedChars + totalForeign;
      if (totalChars > 0) {
        const pctPaste = state.totalPastedChars / totalChars;
        // Paste takes priority - if paste detected, show paste (not AI)
        if (pctPaste > 0.1) {
          state.lastVerification = {
            class_label: pctPaste > 0.5 ? "paste" : "paste_detected",
            verdict: "paste_detected",
            confidence: Math.min(0.5 + pctPaste * 0.5, 0.99),
            is_human: false,
          };
          await chrome.action.setBadgeText({ text: "📋" });
          await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
        }
      }

      await saveState();
      return { success: true, data: { recorded: true } };
    }

    case "VERIFY_SESSION": {
      // Use session_id from payload or fall back to state
      const payload = (message as ExtensionMessage).payload as
        | { session_id?: string; text_content?: string }
        | undefined;
      const sessionId = payload?.session_id || state.sessionId;
      const textContent = payload?.text_content || "";

      if (!sessionId) {
        return { success: false, error: "No active session" };
      }

      try {
        // Use combined verification if we have text content
        if (textContent && textContent.length >= 50) {
          const stats = calculateStats();
          const result = await verifyCombined(
            sessionId,
            textContent,
            stats.pasteCount,
            stats.pasteRatio,
          );
          state.lastVerification = {
            class_label: result.verdict,
            confidence: result.confidence_score,
            is_human: result.is_human,
          };

          // Show badge based on result
          if (result.is_human) {
            await chrome.action.setBadgeText({ text: "✓" });
            await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
          } else {
            await chrome.action.setBadgeText({ text: "!" });
            await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
          }

          return { success: true, data: result };
        }

        // Fallback to keystroke-only verification
        const result = await verifySession(sessionId);
        state.lastVerification = {
          class_label: result.is_human ? "human_organic" : "unknown",
          confidence: result.confidence_score,
          is_human: result.is_human,
        };

        // Show badge based on result
        if (result.is_human) {
          await chrome.action.setBadgeText({ text: "✓" });
          await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        } else {
          await chrome.action.setBadgeText({ text: "?" });
          await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
        }

        return { success: true, data: result };
      } catch (error) {
        // Fallback: local verification with PASTE DETECTION
        const stats = calculateStats();

        // CRITICAL: Check paste and AI ratios separately
        // Paste = actual clipboard paste (Ctrl+V)
        // AI = AI assistant insertions (Tab to accept)
        const isPasteDetected = stats.pasteRatio > 0.1;
        const isAiDetected = stats.aiRatio > 0.1;
        const hasSignificantPaste = stats.totalPastedChars > 50;
        const hasSignificantAi = stats.totalAiChars > 50;

        // Typing quality checks
        const hasNormalDwell = stats.avgDwell > 30 && stats.avgDwell < 500;
        const hasNormalFlight = stats.avgFlight > 50 && stats.avgFlight < 1000;
        const hasReasonableWpm = stats.wpm > 5 && stats.wpm < 150;
        const hasEnoughKeystrokes = stats.keystrokeCount > 20;

        // Determine classification - PASTE takes priority over AI
        let classLabel: string;
        let isHuman: boolean;
        let confidence: number;

        if (isPasteDetected || hasSignificantPaste) {
          // Clipboard paste detected - NOT AI assisted
          classLabel = stats.pasteRatio > 0.5 ? "paste" : "paste_detected";
          isHuman = false;
          // Confidence based on paste ratio
          confidence = Math.min(0.99, 0.5 + stats.pasteRatio * 0.5);
        } else if (isAiDetected || hasSignificantAi) {
          // AI assistant content detected - distinct from paste
          classLabel = "ai_assisted";
          isHuman = false;
          // Confidence based on AI ratio
          confidence = Math.min(0.99, 0.5 + stats.aiRatio * 0.5);
        } else if (
          hasEnoughKeystrokes &&
          hasNormalDwell &&
          hasNormalFlight &&
          hasReasonableWpm
        ) {
          // Looks like human typing
          classLabel = "human_organic";
          isHuman = true;
          // Base confidence on typing quality metrics
          const dwellScore = hasNormalDwell ? 0.3 : 0;
          const flightScore = hasNormalFlight ? 0.3 : 0;
          const wpmScore = hasReasonableWpm ? 0.2 : 0;
          const volumeScore = Math.min(0.2, stats.keystrokeCount / 500);
          confidence = dwellScore + flightScore + wpmScore + volumeScore;
        } else {
          // Not enough data or suspicious patterns
          classLabel = "unknown";
          isHuman = false;
          confidence = 0.3;
        }

        state.lastVerification = {
          class_label: classLabel,
          confidence,
          is_human: isHuman,
        };

        // Update badge - different icons for paste vs AI
        if (isPasteDetected || hasSignificantPaste) {
          await chrome.action.setBadgeText({ text: "📋" });
          await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // Red for paste
        } else if (isAiDetected || hasSignificantAi) {
          await chrome.action.setBadgeText({ text: "🤖" });
          await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Yellow for AI
        } else if (isHuman) {
          await chrome.action.setBadgeText({ text: "✓" });
          await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        } else {
          await chrome.action.setBadgeText({ text: "?" });
          await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
        }

        return {
          success: true,
          data: {
            is_human: isHuman,
            confidence_score: confidence,
            class_label: classLabel,
            local: true,
            paste_detected: isPasteDetected || hasSignificantPaste,
            paste_ratio: stats.pasteRatio,
            paste_count: stats.pasteCount,
            error_message: "Server unavailable, using local verification",
          },
        };
      }
    }

    // Popup handlers
    case "GET_STATS": {
      const stats = calculateStats();
      return { stats };
    }

    case "STOP_RECORDING": {
      state.isRecording = false;
      return { success: true };
    }

    case "GENERATE_REPORT": {
      // Legacy handler - redirect to DOWNLOAD_COMBINED
      return handleMessage({
        type: "DOWNLOAD_COMBINED",
        payload: { textContent: "" },
      });
    }

    case "DOWNLOAD_COMBINED": {
      const payload = (message as ExtensionMessage).payload as
        | { textContent?: string }
        | undefined;
      const textContent = payload?.textContent || "";

      // Generate stats
      const stats = calculateStats();

      // Build classification from current state - ensure consistency with popup
      const totalForeign = state.totalPastedChars + state.totalAiChars;
      const totalChars = state.totalTypedChars + totalForeign;

      let classificationData: {
        verdict: string;
        class_label: string;
        confidence: number;
        is_human: boolean;
        paste_ratio: number;
        ai_ratio: number;
        human_ratio: number;
      };

      if (totalChars > 20) {
        const pctHuman = state.totalTypedChars / totalChars;
        const pctPaste = state.totalPastedChars / totalChars;
        const pctAi = state.totalAiChars / totalChars;

        let verdict: string;
        let isHuman: boolean;
        let confidence: number;

        // Priority: Paste > AI > Human (same logic as real-time)
        if (pctPaste > 0.1) {
          verdict = pctPaste > 0.5 ? "paste" : "paste_detected";
          isHuman = false;
          confidence = Math.min(0.5 + pctPaste * 0.5, 0.99);
        } else if (pctAi > 0.1) {
          verdict = "ai_assisted";
          isHuman = false;
          confidence = Math.min(0.5 + pctAi * 0.5, 0.99);
        } else if (pctHuman >= 0.9) {
          verdict = "human_organic";
          isHuman = true;
          confidence = Math.min(0.7 + pctHuman * 0.3, 0.99);
        } else {
          verdict = state.lastVerification?.class_label || "unknown";
          isHuman = state.lastVerification?.is_human || false;
          confidence = state.lastVerification?.confidence || 0.5;
        }

        classificationData = {
          verdict,
          class_label: verdict,
          confidence,
          is_human: isHuman,
          paste_ratio: pctPaste,
          ai_ratio: pctAi,
          human_ratio: pctHuman,
        };
      } else {
        // Not enough data
        classificationData = {
          verdict: "unverified",
          class_label: "unverified",
          confidence: 0,
          is_human: false,
          paste_ratio: 0,
          ai_ratio: 0,
          human_ratio: 1,
        };
      }

      // Create the .humanSign metadata with crypto signature
      const humanSignData = {
        version: "1.0",
        generated_at: new Date().toISOString(),
        session: {
          id: state.sessionId || crypto.randomUUID(),
          domain: state.domain || "unknown",
          duration_ms: state.startTime ? Date.now() - state.startTime : 0,
        },
        metrics: {
          total_keystrokes: stats.keystrokeCount,
          avg_dwell_ms: Math.round(stats.avgDwell),
          avg_flight_ms: Math.round(stats.avgFlight),
          wpm: Math.round(stats.wpm),
          text_length: textContent.length,
          total_typed_chars: state.totalTypedChars,
          total_pasted_chars: state.totalPastedChars,
          total_ai_chars: state.totalAiChars,
        },
        classification: classificationData,
        timing_data: {
          dwell_histogram: createHistogram(stats.dwellTimes, 10, 0, 200),
          flight_histogram: createHistogram(stats.flightTimes, 10, 0, 300),
        },
        content_hash: "", // Will be filled below
        signature: {
          algorithm: "ECDSA-P256-SHA256",
          public_key: "",
          signature_value: "",
          signed_at: new Date().toISOString(),
        },
      };

      // Compute SHA-256 hash of text content
      const textEncoder = new TextEncoder();
      const textBytes = textEncoder.encode(textContent);
      const hashBuffer = await crypto.subtle.digest("SHA-256", textBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      humanSignData.content_hash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Generate ECDSA key pair for signing
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["sign", "verify"],
        );

        // Export public key
        const publicKeyBuffer = await crypto.subtle.exportKey(
          "spki",
          keyPair.publicKey,
        );
        const publicKeyArray = Array.from(new Uint8Array(publicKeyBuffer));
        humanSignData.signature.public_key = btoa(
          String.fromCharCode(...publicKeyArray),
        );

        // Create data to sign (metrics + hash)
        const dataToSign = JSON.stringify({
          content_hash: humanSignData.content_hash,
          metrics: humanSignData.metrics,
          session_id: humanSignData.session.id,
        });
        const signatureData = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keyPair.privateKey,
          textEncoder.encode(dataToSign),
        );
        const signatureArray = Array.from(new Uint8Array(signatureData));
        humanSignData.signature.signature_value = btoa(
          String.fromCharCode(...signatureArray),
        );

        state.signatureCount++;
      } catch (e) {
        console.error("[HumanSign] Crypto error:", e);
      }

      // Create ZIP containing document and metadata
      const humanSignJson = JSON.stringify(humanSignData, null, 2);
      const readme = `HumanSign Verified Document
============================
Generated: ${humanSignData.generated_at}
Session ID: ${humanSignData.session.id}

Status: ${humanSignData.classification.is_human ? "HUMAN VERIFIED ✓" : "UNVERIFIED"}
Confidence: ${((humanSignData.classification.confidence || 0) * 100).toFixed(1)}%

Files:
- document.txt: Your original content
- metadata.humanSign: Verification data (upload to decoder)

Verify at: http://localhost:3000/decoder
`;

      const zipBase64 = createZip([
        { name: "document.txt", content: textContent },
        { name: "metadata.humanSign", content: humanSignJson },
        { name: "README.txt", content: readme },
      ]);

      const zipDataUrl = "data:application/zip;base64," + zipBase64;
      const filename = `humansign_${humanSignData.session.id.slice(0, 8)}.zip`;

      await chrome.downloads.download({
        url: zipDataUrl,
        filename,
        saveAs: true,
      });

      return { success: true, downloaded: true };
    }

    default:
      return { success: false, error: "Unknown message type" };
  }
}

// Create histogram from values
function createHistogram(
  values: number[],
  bins: number,
  min: number,
  max: number,
): number[] {
  const histogram = new Array(bins).fill(0);
  const binSize = (max - min) / bins;

  for (const v of values) {
    const binIndex = Math.min(
      bins - 1,
      Math.max(0, Math.floor((v - min) / binSize)),
    );
    histogram[binIndex]++;
  }

  return histogram;
}

// Log when service worker starts
console.log("[HumanSign Background] Service worker started");
