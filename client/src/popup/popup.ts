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
    class_id: number;
    class_label: string;
    confidence: number;
    is_human: boolean;
    probabilities?: Record<string, number>;
}

interface SessionStats {
    keystrokeCount: number;
    avgDwell: number;
    avgFlight: number;
    wpm: number;
    sessionId: string | null;
    isRecording: boolean;
    signatureCount: number;
}

// Badge configurations
const BADGE_CONFIG: Record<string, { icon: string; label: string; class: string }> = {
    human_organic: { icon: '🟢', label: 'Verified Human', class: 'badge-verified' },
    human_nonnative: { icon: '🟢', label: 'Human (Non-Native)', class: 'badge-verified' },
    human_coding: { icon: '🟢', label: 'Human (Coding)', class: 'badge-verified' },
    paste: { icon: '🔴', label: 'Paste Detected', class: 'badge-suspicious' },
    ai_assisted: { icon: '🟡', label: 'AI Assisted', class: 'badge-assisted' },
    copy_paste_hybrid: { icon: '🟡', label: 'Mixed Input', class: 'badge-assisted' },
    unknown: { icon: '⚪', label: 'Unknown', class: 'badge-unknown' },
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

    constructor() {
        this.initElements();
        this.bindEvents();
        this.loadState();
        this.startPolling();
    }

    private initElements(): void {
        const ids = [
            'badge', 'status-text', 'session-id',
            'keystroke-count', 'wpm', 'dwell-avg', 'flight-avg',
            'verification-result', 'result-icon', 'result-label',
            'result-class', 'result-confidence',
            'btn-toggle', 'btn-verify', 'btn-report', 'sig-count',
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.elements[id] = el;
        });
    }

    private bindEvents(): void {
        this.elements['btn-toggle']?.addEventListener('click', () => this.toggleRecording());
        this.elements['btn-verify']?.addEventListener('click', () => this.verify());
        this.elements['btn-report']?.addEventListener('click', () => this.downloadReport());
    }

    private async loadState(): Promise<void> {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
            if (response?.stats) {
                this.updateStats(response.stats);
            }
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    }

    private startPolling(): void {
        setInterval(() => this.loadState(), 500);
    }

    private updateStats(stats: SessionStats): void {
        this.state.keystrokeCount = stats.keystrokeCount;
        this.state.sessionId = stats.sessionId;
        this.state.isRecording = stats.isRecording;
        this.state.signatureCount = stats.signatureCount;

        // Update DOM
        this.elements['keystroke-count'].textContent = stats.keystrokeCount.toString();
        this.elements['wpm'].textContent = stats.wpm > 0 ? stats.wpm.toFixed(0) : '--';
        this.elements['dwell-avg'].textContent = stats.avgDwell > 0 ? stats.avgDwell.toFixed(0) : '--';
        this.elements['flight-avg'].textContent = stats.avgFlight > 0 ? stats.avgFlight.toFixed(0) : '--';
        this.elements['session-id'].textContent = stats.sessionId?.slice(0, 8) || '--';
        this.elements['sig-count'].textContent = stats.signatureCount.toString();

        // Update toggle button state
        const toggleBtn = this.elements['btn-toggle'] as HTMLButtonElement;
        if (stats.isRecording) {
            toggleBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Recording';
            toggleBtn.classList.add('recording');
            this.elements['status-text'].textContent = 'Recording';
            document.body.classList.add('recording');
        } else {
            toggleBtn.innerHTML = '<span class="btn-icon">▶️</span> Start Recording';
            toggleBtn.classList.remove('recording');
            this.elements['status-text'].textContent = stats.keystrokeCount > 0 ? 'Ready' : 'Idle';
            document.body.classList.remove('recording');
        }

        // Enable/disable buttons
        const hasData = stats.keystrokeCount > 20;
        (this.elements['btn-verify'] as HTMLButtonElement).disabled = !hasData;
        (this.elements['btn-report'] as HTMLButtonElement).disabled = !hasData;
    }

    private async toggleRecording(): Promise<void> {
        const toggleBtn = this.elements['btn-toggle'] as HTMLButtonElement;
        toggleBtn.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.id) throw new Error('No active tab');

            if (this.state.isRecording) {
                // Stop recording
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_STOP_TRACKING' });
                } catch {
                    // Content script not available, that's ok
                }
                await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
            } else {
                // Start recording - first start in background
                await chrome.runtime.sendMessage({
                    type: 'START_SESSION',
                    payload: { domain: new URL(tab.url || '').hostname }
                });

                // Try to start content script tracking
                let contentScriptReady = false;
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_START_TRACKING' });
                    contentScriptReady = true;
                } catch {
                    // Content script not available - try to inject it programmatically
                    console.warn('[HumanSign] Content script not loaded, injecting...');
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id, allFrames: true },
                            files: ['content.js']
                        });
                        // Wait a moment for script to initialize
                        await new Promise(resolve => setTimeout(resolve, 200));
                        // Try again
                        await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_START_TRACKING' });
                        contentScriptReady = true;
                        console.log('[HumanSign] Content script injected successfully');
                    } catch (injectError) {
                        console.error('[HumanSign] Failed to inject content script:', injectError);
                    }
                }

                if (!contentScriptReady) {
                    this.showError('Could not start tracking. Try refreshing the page.');
                }
            }
        } catch (e) {
            console.error('Toggle error:', e);
            this.showError('Failed to toggle recording');
        } finally {
            toggleBtn.disabled = false;
            await this.loadState();
        }
    }

    private async verify(): Promise<void> {
        const btn = this.elements['btn-verify'] as HTMLButtonElement;
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Verifying...';

        try {
            // First, get text content from the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            let textContent = '';

            if (tab.id) {
                try {
                    const textResponse = await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_GET_TEXT' });
                    if (textResponse?.text) {
                        textContent = textResponse.text;
                    }
                } catch {
                    console.warn('[HumanSign] Could not get text content from page');
                }
            }

            // Send verification request with text content for ML analysis
            const response = await chrome.runtime.sendMessage({
                type: 'VERIFY_SESSION',
                payload: { text_content: textContent }
            });

            if (response?.data || response?.result) {
                const result = response.data || response.result;
                this.showVerificationResult({
                    class_id: 0,
                    class_label: result.verdict || result.class_label || (result.is_human ? 'human_organic' : 'unknown'),
                    confidence: result.confidence_score || result.confidence || 0,
                    is_human: result.is_human,
                    probabilities: result.probabilities,
                });
            } else if (response?.error) {
                this.showError(response.error);
            } else {
                this.showError('Verification failed');
            }
        } catch (e) {
            console.error('[HumanSign] Verify error:', e);
            this.showError('Connection error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🔍</span> Verify Session';
        }
    }

    private showVerificationResult(result: VerificationResult): void {
        this.state.verificationResult = result;

        const config = BADGE_CONFIG[result.class_label] || BADGE_CONFIG.unknown;

        // Update badge
        this.elements['badge'].textContent = config.icon;
        this.elements['badge'].className = `badge ${config.class}`;

        // Update result panel
        this.elements['result-icon'].textContent = config.icon;
        this.elements['result-label'].textContent = config.label;
        this.elements['result-class'].textContent = result.class_label;
        this.elements['result-confidence'].textContent = `${(result.confidence * 100).toFixed(1)}%`;

        // Show panel
        this.elements['verification-result'].classList.remove('hidden');
    }

    private async downloadReport(): Promise<void> {
        const btn = this.elements['btn-report'] as HTMLButtonElement;
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Downloading...';

        try {
            // First, get text content from the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            let textContent = '';

            if (tab.id) {
                try {
                    const textResponse = await chrome.tabs.sendMessage(tab.id, { type: 'CONTENT_GET_TEXT' });
                    if (textResponse?.text) {
                        textContent = textResponse.text;
                    }
                } catch {
                    // Content script might not be loaded
                    console.warn('Could not get text from page');
                }
            }

            // Now request combined download from background
            const response = await chrome.runtime.sendMessage({
                type: 'DOWNLOAD_COMBINED',
                payload: { textContent }
            });

            if (response?.success) {
                this.showSuccess('Report downloaded!');
            } else {
                this.showError(response?.error || 'Download failed');
            }
        } catch (e) {
            this.showError('Connection error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">📥</span> Download Report';
        }
    }

    private showError(message: string): void {
        this.elements['status-text'].textContent = `Error: ${message}`;
        this.elements['status-text'].style.color = '#d63031';

        setTimeout(() => {
            this.elements['status-text'].style.color = '';
            this.loadState();
        }, 3000);
    }

    private showSuccess(message: string): void {
        this.elements['status-text'].textContent = message;
        this.elements['status-text'].style.color = '#00b894';

        setTimeout(() => {
            this.elements['status-text'].style.color = '';
            this.loadState();
        }, 2000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
