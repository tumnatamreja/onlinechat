/**
 * GhostLine E2E crypto helper.
 *
 * Uses TweetNaCl's `box` (X25519 key exchange + XSalsa20-Poly1305 AEAD).
 * Each party generates a keypair on first use and stores the secret key
 * locally (operator: localStorage in browser; client: localStorage too).
 * The server only ever sees public keys and ciphertext.
 *
 * Copy this file into both the `operator` and `widget` projects
 * (or publish as a tiny shared npm package).
 */
import nacl from 'tweetnacl';
import {
  encodeBase64,
  decodeBase64,
  encodeUTF8,
  decodeUTF8,
} from 'tweetnacl-util';

export interface KeyPairB64 {
  publicKey: string;
  secretKey: string;
}

export function generateKeyPair(): KeyPairB64 {
  const kp = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

/**
 * Encrypt a plaintext string for a recipient, using our secret key
 * and their public key. Returns base64 ciphertext + base64 nonce.
 */
export function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string,
  mySecretKeyB64: string
): { encryptedContent: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = decodeUTF8(plaintext);
  const recipientPublicKey = decodeBase64(recipientPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);

  const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, mySecretKey);

  return {
    encryptedContent: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a message from a sender, using our secret key and their public key.
 * Returns null if decryption/auth fails (tampering or wrong keys).
 */
export function decryptMessage(
  encryptedContentB64: string,
  nonceB64: string,
  senderPublicKeyB64: string,
  mySecretKeyB64: string
): string | null {
  const encrypted = decodeBase64(encryptedContentB64);
  const nonce = decodeBase64(nonceB64);
  const senderPublicKey = decodeBase64(senderPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);

  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, mySecretKey);
  if (!decrypted) return null;

  return encodeUTF8(decrypted);
}

/**
 * Encrypt raw binary (file) data for a recipient.
 * Input/output as Uint8Array for efficiency with large files.
 */
export function encryptBytes(
  data: Uint8Array,
  recipientPublicKeyB64: string,
  mySecretKeyB64: string
): { encrypted: Uint8Array; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const recipientPublicKey = decodeBase64(recipientPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);

  const encrypted = nacl.box(data, nonce, recipientPublicKey, mySecretKey);
  return { encrypted, nonce: encodeBase64(nonce) };
}

export function decryptBytes(
  encrypted: Uint8Array,
  nonceB64: string,
  senderPublicKeyB64: string,
  mySecretKeyB64: string
): Uint8Array | null {
  const nonce = decodeBase64(nonceB64);
  const senderPublicKey = decodeBase64(senderPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);

  return nacl.box.open(encrypted, nonce, senderPublicKey, mySecretKey);
}

export { encodeBase64, decodeBase64 };
