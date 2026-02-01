/**
 * Cryptographic Hashing for HumanSign
 * 
 * Uses Web Crypto API (SubtleCrypto) for SHA-256 hashing
 * of keystroke buffers.
 */

import { KeystrokeEvent } from '../types';

/**
 * Hash a keystroke buffer using SHA-256.
 * Returns hex-encoded digest.
 */
export async function hashKeystrokeBuffer(events: KeystrokeEvent[]): Promise<string> {
    // Serialize events to deterministic JSON
    const serialized = serializeEvents(events);

    // Encode to bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to hex string
    return bufferToHex(hashBuffer);
}

/**
 * Create a chained hash from current buffer and previous hash.
 * Implements simple hash chaining: H(prev || current)
 */
export async function createChainedHash(
    currentEvents: KeystrokeEvent[],
    previousHash: string | null
): Promise<string> {
    const currentSerialized = serializeEvents(currentEvents);
    const toHash = previousHash
        ? `${previousHash}:${currentSerialized}`
        : currentSerialized;

    const encoder = new TextEncoder();
    const data = encoder.encode(toHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return bufferToHex(hashBuffer);
}

/**
 * Serialize keystroke events to deterministic string.
 * Only includes timing data, not content (privacy).
 */
function serializeEvents(events: KeystrokeEvent[]): string {
    const timingOnly = events.map(e => ({
        t: e.event_type,                      // 'keydown' or 'keyup'
        ts: Math.round(e.client_timestamp),   // Rounded timestamp
        c: e.key_code,                        // Key code
    }));

    return JSON.stringify(timingOnly);
}

/**
 * Convert ArrayBuffer to hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Parse hex string to ArrayBuffer.
 */
export function hexToBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

/**
 * Generate a random nonce for timestamping.
 */
export function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bufferToHex(bytes.buffer);
}
