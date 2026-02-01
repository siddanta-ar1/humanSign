/**
 * Crypto module exports
 */

export {
    hashKeystrokeBuffer,
    createChainedHash,
    generateNonce,
    hexToBuffer,
} from './hashing';

export {
    generateKeyPair,
    exportKeyPair,
    importKeyPair,
    signDigest,
    verifySignature,
    createSignatureBundle,
    getOrCreateKeyPair,
    getPublicKeyForBackend,
} from './signing';

export type { KeyPairExport, SignatureBundle } from './signing';
