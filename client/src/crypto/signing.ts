/**
 * ECDSA Digital Signatures for HumanSign
 * 
 * Uses Web Crypto API for ECDSA P-256 signing.
 * Private keys stored in chrome.storage.local.
 */

export interface KeyPairExport {
    publicKey: string;   // Base64-encoded SPKI
    privateKey: string;  // Base64-encoded PKCS8
}

export interface SignatureBundle {
    signature: string;   // Base64-encoded signature
    publicKey: string;   // Base64-encoded public key
    timestamp: number;   // Unix timestamp
    nonce: string;       // Random nonce
}

const ALGORITHM: EcdsaParams = {
    name: 'ECDSA',
    hash: 'SHA-256',
};

const KEY_GEN_PARAMS: EcKeyGenParams = {
    name: 'ECDSA',
    namedCurve: 'P-256',
};

/**
 * Generate a new ECDSA P-256 key pair.
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(KEY_GEN_PARAMS, true, ['sign', 'verify']);
}

/**
 * Export key pair to storable format.
 */
export async function exportKeyPair(keyPair: CryptoKeyPair): Promise<KeyPairExport> {
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
        publicKey: bufferToBase64(publicKeyBuffer),
        privateKey: bufferToBase64(privateKeyBuffer),
    };
}

/**
 * Import key pair from stored format.
 */
export async function importKeyPair(exported: KeyPairExport): Promise<CryptoKeyPair> {
    const publicKeyBuffer = base64ToBuffer(exported.publicKey);
    const privateKeyBuffer = base64ToBuffer(exported.privateKey);

    const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        KEY_GEN_PARAMS,
        true,
        ['verify']
    );

    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        KEY_GEN_PARAMS,
        true,
        ['sign']
    );

    return { publicKey, privateKey };
}

/**
 * Sign a hash digest with private key.
 */
export async function signDigest(
    digest: string,
    privateKey: CryptoKey
): Promise<string> {
    const data = hexToBuffer(digest);
    const signature = await crypto.subtle.sign(ALGORITHM, privateKey, data);
    return bufferToBase64(signature);
}

/**
 * Verify a signature against a digest.
 */
export async function verifySignature(
    digest: string,
    signature: string,
    publicKey: CryptoKey
): Promise<boolean> {
    const data = hexToBuffer(digest);
    const sig = base64ToBuffer(signature);

    return crypto.subtle.verify(ALGORITHM, publicKey, sig, data);
}

/**
 * Create a complete signature bundle.
 */
export async function createSignatureBundle(
    digest: string,
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<SignatureBundle> {
    const signature = await signDigest(digest, privateKey);
    const publicKeyExport = await crypto.subtle.exportKey('spki', publicKey);

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return {
        signature,
        publicKey: bufferToBase64(publicKeyExport),
        timestamp: Date.now(),
        nonce,
    };
}

// Storage helpers
const STORAGE_KEY = 'humansign_keypair';

/**
 * Get or create the signing key pair.
 */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
    // Try to load from storage
    const stored = await chrome.storage.local.get(STORAGE_KEY);

    if (stored[STORAGE_KEY]) {
        try {
            return await importKeyPair(stored[STORAGE_KEY]);
        } catch (e) {
            console.warn('Failed to import stored key pair, generating new one');
        }
    }

    // Generate new key pair
    const keyPair = await generateKeyPair();
    const exported = await exportKeyPair(keyPair);

    // Store for future use
    await chrome.storage.local.set({ [STORAGE_KEY]: exported });

    return keyPair;
}

/**
 * Get the public key for registration with backend.
 */
export async function getPublicKeyForBackend(): Promise<string> {
    const keyPair = await getOrCreateKeyPair();
    const exported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    return bufferToBase64(exported);
}

// Utility functions
function bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function hexToBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}
