/**
 * Keystroke event as captured from the DOM.
 */
export interface KeystrokeEvent {
    event_type: 'keydown' | 'keyup';
    key_code: number;
    key_char: string | null;
    client_timestamp: number; // performance.now() value
}

/**
 * Paste event for detecting copy-paste behavior.
 */
export interface PasteEvent {
    event_type: 'paste';
    pasted_length: number;
    client_timestamp: number;
}

/**
 * Batch of keystroke events for API submission.
 */
export interface KeystrokeBatch {
    session_id: string;
    events: KeystrokeEvent[];
    batch_sequence: number;
}

/**
 * Session data from the API.
 */
export interface Session {
    id: string;
    user_id: string;
    started_at: string;
    ended_at: string | null;
    domain: string | null;
}

/**
 * Verification result from ML inference.
 */
export interface VerificationResult {
    session_id: string;
    is_human: boolean;
    confidence_score: number;
    features_summary: Record<string, number>;
    computed_at: string;
}

/**
 * Messages between content script and background worker.
 */
export type ExtensionMessage =
    | { type: 'KEYSTROKE_BATCH'; payload: KeystrokeBatch }
    | { type: 'PASTE_EVENT'; payload: { session_id: string; event: PasteEvent } }
    | { type: 'START_SESSION'; payload: { domain: string } }
    | { type: 'END_SESSION'; payload: { session_id: string } }
    | { type: 'VERIFY_SESSION'; payload: { session_id: string } };

/**
 * Response from background worker.
 */
export type ExtensionResponse<T = unknown> =
    | { success: true; data: T }
    | { success: false; error: string };
