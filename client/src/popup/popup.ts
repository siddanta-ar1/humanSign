/**
 * HumanSign Extension Popup
 *
 * Displays real-time typing stats, verification results,
 * and provides manual controls for recording.
 */

interface PopupState {
  sessionId: string | null;
  keystrokeCount: number;
  isRecording: boolean;
  verificationResult: VerificationResult | null;
  signatureCount: number;
}

interface VerificationResult {
  class_id?: number;
  class_label: string;
  confidence: number;
  is_human: boolean;
  probabilities?: Record<string, number>;
  feedback?: string;
}

interface RealTimeVerdict {
  verdict: string;
  confidence: number;
  isHuman: boolean;
  totalTyped: number;
  totalPaste: number;
  totalAI: number;
  pctHuman: number;
  pctPaste: number;
  pctAI: number;
}

interface SessionStats {
  keystrokeCount: number;
  avgDwell: number;
  avgFlight: number;
  wpm: number;
  sessionId: string | null;
  isRecording: boolean;
  signatureCount: number;
  currentVerdict?: string;
  currentConfidence?: number;
  totalTypedChars?: number;
  totalPastedChars?: number;
  totalAiChars?: number;
}

// Badge configurations with smooth transitions
const BADGE_CONFIG: Record<
  string,
  { icon: string; label: string; class: string }
> = {
  // Human classifications
  human_organic: {
    icon: "🟢",
    label: "Verified Human",
    class: "badge-verified",
  },
  human_verified: {
    icon: "🟢",
    label: "Verified Human",
    class: "badge-verified",
  },
  human_nonnative: {
    icon: "🟢",
    label: "Human (Non-Native)",
    class: "badge-verified",
  },
  human_coding: {
    icon: "🟢",
    label: "Human (Coding)",
    class: "badge-verified",
  },
  human_content_heuristic: {
    icon: "🟢",
    label: "Likely Human",
    class: "badge-verified",
  },

  // Paste/Copy classifications
  paste: { icon: "🔴", label: "Paste Detected", class: "badge-suspicious" },
  paste_detected: {
    icon: "🔴",
    label: "Paste Detected",
    class: "badge-suspicious",
  },

  // AI classifications
  ai_assisted: { icon: "🟡", label: "AI Assisted", class: "badge-assisted" },
  ai_content_heuristic: {
    icon: "🟡",
    label: "Likely AI",
    class: "badge-assisted",
  },
  copy_paste_hybrid: {
    icon: "🟡",
    label: "Mixed Input",
    class: "badge-assisted",
  },

  // Uncertain/Unknown states
  unknown: { icon: "⚪", label: "Analyzing...", class: "badge-unknown" },
  waiting: { icon: "⏳", label: "Waiting...", class: "badge-waiting" },
  insufficient_data: {
    icon: "⚪",
    label: "Need More Data",
    class: "badge-unknown",
  },
  uncertain_keystrokes: {
    icon: "⚪",
    label: "Uncertain",
    class: "badge-unknown",
  },
};

class PopupController {
  private state: PopupState = {
    sessionId: null,
    keystrokeCount: 0,
    isRecording: false,
    verificationResult: null,
    signatureCount: 0,
  };

  // DOM Elements
  private elements: Record<string, HTMLElement> = {};
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initElements();
    this.bindEvents();
    this.loadState();
    this.startPolling();
  }

  private initElements(): void {
    const ids = [
      "badge",
      "status-text",
      "session-id",
      "keystroke-count",
      "wpm",
      "dwell-avg",
      "flight-avg",
      "verification-result",
      "result-icon",
      "result-label",
      "result-class",
      "result-confidence",
      "btn-toggle",
      "btn-verify",
      "btn-report",
      "sig-count",
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) this.elements[id] = el;
    });
  }

  private bindEvents(): void {
    this.elements["btn-toggle"]?.addEventListener("click", () =>
      this.toggleRecording(),
    );
    this.elements["btn-verify"]?.addEventListener("click", () => this.verify());
    this.elements["btn-report"]?.addEventListener("click", () =>
      this.downloadReport(),
    );
  }

  private async loadState(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATS" });
      if (response?.stats) {
        this.updateStats(response.stats);

        // Build real-time verdict from stats - separate paste from AI
        const stats = response.stats;
        const totalTyped = stats.totalTypedChars || 0;
        const totalPaste = stats.totalPastedChars || 0;
        const totalAI = stats.totalAiChars || 0;
        const totalForeign = totalPaste + totalAI;
        const totalChars = totalTyped + totalForeign;

        if (stats.currentVerdict || totalChars > 0) {
          const pctHuman = totalChars > 0 ? totalTyped / totalChars : 1;
          const pctPaste = totalChars > 0 ? totalPaste / totalChars : 0;
          const pctAI = totalChars > 0 ? totalAI / totalChars : 0;

          this.updateRealTimeVerdict({
            verdict:
              stats.currentVerdict ||
              (stats.keystrokeCount > 20 ? "human_organic" : "waiting"),
            confidence: stats.currentConfidence || pctHuman,
            isHuman: pctHuman >= 0.9,
            totalTyped,
            totalPaste,
            totalAI,
            pctHuman,
            pctPaste,
            pctAI,
          });
        }
      }
    } catch (e) {
      console.error("Failed to load state:", e);
    }
  }

  private updateRealTimeVerdict(verdict: RealTimeVerdict): void {
    // Get badge config with fallback chain
    const verdictKey = verdict.verdict || "waiting";
    const config = BADGE_CONFIG[verdictKey] || BADGE_CONFIG["unknown"];

    // Smooth badge transition
    if (this.elements["badge"]) {
      const badge = this.elements["badge"];
      // Add transition class for smooth animation
      badge.style.transition = "all 0.3s ease-in-out";
      badge.textContent = config.icon;
      badge.className = `badge ${config.class}`;
    }

    // Show real-time result panel with smooth transition
    if (this.elements["verification-result"]) {
      const panel = this.elements["verification-result"];
      panel.style.transition = "opacity 0.3s ease-in-out";
      panel.classList.remove("hidden");
    }

    // Update result details with smooth transitions
    if (this.elements["result-icon"]) {
      this.elements["result-icon"].textContent = config.icon;
    }
    if (this.elements["result-label"]) {
      this.elements["result-label"].textContent = config.label;
    }
    if (this.elements["result-class"]) {
      this.elements["result-class"].textContent = verdictKey.replace(/_/g, " ");
    }
    if (this.elements["result-confidence"]) {
      const confidencePct = (verdict.confidence * 100).toFixed(0);
      this.elements["result-confidence"].textContent = `${confidencePct}%`;
    }

    // Update feedback with breakdown - show paste and AI separately
    const feedbackEl = document.getElementById("result-feedback");
    if (feedbackEl) {
      const totalChars =
        verdict.totalTyped + verdict.totalPaste + verdict.totalAI;
      if (totalChars > 0) {
        const humanPct = (verdict.pctHuman * 100).toFixed(0);
        const pastePct = (verdict.pctPaste * 100).toFixed(0);
        const aiPct = (verdict.pctAI * 100).toFixed(0);

        // Build feedback message showing separate paste and AI
        let feedbackParts = [
          `Human: ${humanPct}% (${verdict.totalTyped} chars)`,
        ];
        if (verdict.totalPaste > 0) {
          feedbackParts.push(
            `Paste: ${pastePct}% (${verdict.totalPaste} chars)`,
          );
        }
        if (verdict.totalAI > 0) {
          feedbackParts.push(`AI: ${aiPct}% (${verdict.totalAI} chars)`);
        }
        feedbackEl.textContent = feedbackParts.join(" | ");
        feedbackEl.style.display = "block";

        // Color based on what was detected
        if (verdict.isHuman) {
          feedbackEl.className = "feedback-msg feedback-success";
        } else if (verdict.pctPaste > 0.1) {
          feedbackEl.className = "feedback-msg feedback-error";
        } else {
          feedbackEl.className = "feedback-msg feedback-warning";
        }
      } else {
        feedbackEl.textContent = "Start typing to begin analysis...";
        feedbackEl.style.display = "block";
        feedbackEl.className = "feedback-msg";
      }
    }
  }

  private startPolling(): void {
    // Clear existing interval if any
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    // Poll frequently for smooth real-time updates
    this.pollingInterval = setInterval(() => this.loadState(), 250);
  }

  private updateStats(stats: SessionStats): void {
    this.state.keystrokeCount = stats.keystrokeCount;
    this.state.sessionId = stats.sessionId;
    this.state.isRecording = stats.isRecording;
    this.state.signatureCount = stats.signatureCount;

    // Update DOM with null checks
    if (this.elements["keystroke-count"]) {
      this.elements["keystroke-count"].textContent =
        stats.keystrokeCount.toString();
    }
    if (this.elements["wpm"]) {
      this.elements["wpm"].textContent =
        stats.wpm > 0 ? stats.wpm.toFixed(0) : "--";
    }
    if (this.elements["dwell-avg"]) {
      this.elements["dwell-avg"].textContent =
        stats.avgDwell > 0 ? stats.avgDwell.toFixed(0) : "--";
    }
    if (this.elements["flight-avg"]) {
      this.elements["flight-avg"].textContent =
        stats.avgFlight > 0 ? stats.avgFlight.toFixed(0) : "--";
    }
    if (this.elements["session-id"]) {
      this.elements["session-id"].textContent =
        stats.sessionId?.slice(0, 8) || "--";
    }
    if (this.elements["sig-count"]) {
      this.elements["sig-count"].textContent = stats.signatureCount.toString();
    }

    // Update toggle button state
    const toggleBtn = this.elements["btn-toggle"] as HTMLButtonElement;
    if (toggleBtn) {
      if (stats.isRecording) {
        toggleBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Recording';
        toggleBtn.classList.add("recording");
        if (this.elements["status-text"]) {
          this.elements["status-text"].textContent = "Recording";
        }
        document.body.classList.add("recording");
      } else {
        toggleBtn.innerHTML =
          '<span class="btn-icon">▶️</span> Start Recording';
        toggleBtn.classList.remove("recording");
        if (this.elements["status-text"]) {
          this.elements["status-text"].textContent =
            stats.keystrokeCount > 0 ? "Ready" : "Idle";
        }
        document.body.classList.remove("recording");
      }
    }

    // Enable/disable buttons based on data availability
    const hasData = stats.keystrokeCount > 20;
    const verifyBtn = this.elements["btn-verify"] as HTMLButtonElement;
    const reportBtn = this.elements["btn-report"] as HTMLButtonElement;
    if (verifyBtn) verifyBtn.disabled = !hasData;
    if (reportBtn) reportBtn.disabled = !hasData;
  }

  private async toggleRecording(): Promise<void> {
    const toggleBtn = this.elements["btn-toggle"] as HTMLButtonElement;
    if (!toggleBtn) return;

    toggleBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) throw new Error("No active tab");

      if (this.state.isRecording) {
        // Stop recording
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "CONTENT_STOP_TRACKING",
          });
        } catch {
          // Content script not available, that's ok
        }
        await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
      } else {
        // Start recording - first start in background
        await chrome.runtime.sendMessage({
          type: "START_SESSION",
          payload: { domain: new URL(tab.url || "").hostname },
        });

        // Try to start content script tracking
        let contentScriptReady = false;
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: "CONTENT_START_TRACKING",
          });
          contentScriptReady = response?.success === true;
        } catch {
          // Content script might not be loaded
        }

        if (!contentScriptReady) {
          this.showError("Could not start tracking. Try refreshing the page.");
        }
      }
    } catch (e) {
      console.error("Toggle error:", e);
      this.showError("Failed to toggle recording");
    } finally {
      toggleBtn.disabled = false;
      await this.loadState();
    }
  }

  private async verify(): Promise<void> {
    const verifyBtn = this.elements["btn-verify"] as HTMLButtonElement;
    if (!verifyBtn) return;

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<span class="btn-icon">⏳</span> Verifying...';

    try {
      // Get text content from active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      let textContent = "";
      if (tab.id) {
        try {
          const textResponse = await chrome.tabs.sendMessage(tab.id, {
            type: "CONTENT_GET_TEXT",
          });
          if (textResponse?.text) {
            textContent = textResponse.text;
          }
        } catch {
          // Content script might not be loaded
        }
      }

      const response = await chrome.runtime.sendMessage({
        type: "VERIFY_SESSION",
        payload: { text_content: textContent },
      });

      if (response?.success && response.data) {
        this.displayVerificationResult(response.data);
      } else {
        this.showError(response?.error || "Verification failed");
      }
    } catch (e) {
      console.error("Verify error:", e);
      this.showError("Connection error");
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = '<span class="btn-icon">✅</span> Verify Now';
    }
  }

  private displayVerificationResult(result: VerificationResult): void {
    this.state.verificationResult = result;

    const config = BADGE_CONFIG[result.class_label] || BADGE_CONFIG["unknown"];

    // Smooth badge update
    if (this.elements["badge"]) {
      this.elements["badge"].style.transition = "all 0.3s ease-in-out";
      this.elements["badge"].textContent = config.icon;
      this.elements["badge"].className = `badge ${config.class}`;
    }

    // Update result panel
    if (this.elements["result-icon"]) {
      this.elements["result-icon"].textContent = config.icon;
    }
    if (this.elements["result-label"]) {
      this.elements["result-label"].textContent = config.label;
    }
    if (this.elements["result-class"]) {
      this.elements["result-class"].textContent = result.class_label.replace(
        /_/g,
        " ",
      );
    }
    if (this.elements["result-confidence"]) {
      this.elements["result-confidence"].textContent =
        `${(result.confidence * 100).toFixed(1)}%`;
    }

    // Show feedback message if available
    const feedbackEl = document.getElementById("result-feedback");
    if (feedbackEl) {
      if (result.feedback) {
        feedbackEl.textContent = result.feedback;
        feedbackEl.style.display = "block";
        // Style based on result
        if (result.is_human) {
          feedbackEl.className = "feedback-msg feedback-success";
        } else if (result.feedback.includes("Insufficient")) {
          feedbackEl.className = "feedback-msg feedback-warning";
        } else {
          feedbackEl.className = "feedback-msg feedback-error";
        }
      } else {
        feedbackEl.style.display = "none";
      }
    }

    // Show panel with smooth transition
    if (this.elements["verification-result"]) {
      this.elements["verification-result"].style.transition =
        "opacity 0.3s ease-in-out";
      this.elements["verification-result"].classList.remove("hidden");
    }
  }

  private async downloadReport(): Promise<void> {
    const btn = this.elements["btn-report"] as HTMLButtonElement;
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Downloading...';

    try {
      // First, get text content from the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      let textContent = "";

      if (tab.id) {
        try {
          const textResponse = await chrome.tabs.sendMessage(tab.id, {
            type: "CONTENT_GET_TEXT",
          });
          if (textResponse?.text) {
            textContent = textResponse.text;
          }
        } catch {
          // Content script might not be loaded
          console.warn("Could not get text from page");
        }
      }

      // Now request combined download from background
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_COMBINED",
        payload: { textContent },
      });

      if (response?.success) {
        this.showSuccess("Report downloaded!");
      } else {
        this.showError(response?.error || "Download failed");
      }
    } catch (e) {
      this.showError("Connection error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">📥</span> Download Report';
    }
  }

  private showError(message: string): void {
    if (this.elements["status-text"]) {
      this.elements["status-text"].textContent = `Error: ${message}`;
      this.elements["status-text"].style.color = "#d63031";

      setTimeout(() => {
        if (this.elements["status-text"]) {
          this.elements["status-text"].style.color = "";
        }
        this.loadState();
      }, 3000);
    }
  }

  private showSuccess(message: string): void {
    if (this.elements["status-text"]) {
      this.elements["status-text"].textContent = message;
      this.elements["status-text"].style.color = "#00b894";

      setTimeout(() => {
        if (this.elements["status-text"]) {
          this.elements["status-text"].style.color = "";
        }
        this.loadState();
      }, 2000);
    }
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
