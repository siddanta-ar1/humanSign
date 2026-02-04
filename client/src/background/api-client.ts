/**
 * API client for communicating with HumanSign backend.
 */

import type {
    Session,
    KeystrokeBatch,
    VerificationResult,
    SessionCreateRequest,
    KeystrokeBatchResponse,
} from '../types';

const API_BASE_URL = 'http://localhost:8002/api/v1';
const TIMEOUT_MS = 10000;

/**
 * Make an API request with timeout.
 */
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Start a new session.
 */
export async function startSession(domain: string): Promise<Session> {
    const userId = await getUserId();

    const request: SessionCreateRequest = {
        user_external_id: userId,
        domain,
    };

    return apiRequest<Session>('/sessions/start', {
        method: 'POST',
        body: JSON.stringify(request),
    });
}

/**
 * End a session.
 */
export async function endSession(sessionId: string): Promise<Session> {
    return apiRequest<Session>(`/sessions/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify({}),
    });
}

/**
 * Send keystroke batch.
 */
export async function sendKeystrokeBatch(
    batch: KeystrokeBatch
): Promise<KeystrokeBatchResponse> {
    return apiRequest<KeystrokeBatchResponse>('/keystrokes/batch', {
        method: 'POST',
        body: JSON.stringify(batch),
    });
}

/**
 * Verify a session (keystroke analysis only).
 */
export async function verifySession(
    sessionId: string
): Promise<VerificationResult> {
    return apiRequest<VerificationResult>('/verify', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
    });
}

/**
 * Combined verification with keystroke + content analysis.
 * This is the most accurate verification method.
 */
export interface CombinedVerificationResult {
    session_id: string;
    is_human: boolean;
    confidence_score: number;
    verdict: string;
    feedback?: string;
    keystroke_analysis: {
        is_human?: boolean;
        confidence?: number;
        features?: Record<string, number>;
        error?: string;
    };
    content_analysis: {
        is_human?: boolean;
        confidence?: number;
        human_score?: number;
        verdict?: string;
        features?: Record<string, number>;
        error?: string;
    };
    combined_features: {
        keystroke_weight: number;
        content_weight: number;
    };
    computed_at: string;
}

export async function verifyCombined(
    sessionId: string,
    textContent: string,
    pasteCount: number = 0,
    pasteRatio: number = 0
): Promise<CombinedVerificationResult> {
    return apiRequest<CombinedVerificationResult>('/verify/combined', {
        method: 'POST',
        body: JSON.stringify({
            session_id: sessionId,
            text_content: textContent,
            paste_count: pasteCount,
            paste_ratio: pasteRatio,
        }),
    });
}

/**
 * Get or create persistent user ID.
 */
async function getUserId(): Promise<string> {
    const result = await chrome.storage.local.get('userId');

    if (result.userId) {
        return result.userId;
    }

    // Generate new user ID
    const userId = crypto.randomUUID();
    await chrome.storage.local.set({ userId });
    return userId;
}

