import { generateKeyPair, KeyPairB64 } from './crypto';

const STORAGE_KEY = 'ghostline_operator_keypair';

/**
 * The operator's E2E secret key NEVER leaves this browser.
 * Only the public key is sent to / stored on the server.
 */
export function getOrCreateKeyPair(): KeyPairB64 {
  if (typeof window === 'undefined') {
    throw new Error('getOrCreateKeyPair must run in the browser');
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored) as KeyPairB64;
  }

  const kp = generateKeyPair();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kp));
  return kp;
}

export function getStoredKeyPair(): KeyPairB64 | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? (JSON.parse(stored) as KeyPairB64) : null;
}

export function regenerateKeyPair(): KeyPairB64 {
  const kp = generateKeyPair();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kp));
  return kp;
}

export function clearKeyPair() {
  localStorage.removeItem(STORAGE_KEY);
}
