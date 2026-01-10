/**
 * Encryption utilities using Web Crypto API for AES-256-GCM encryption.
 * Used for encrypting/decrypting sensitive data like API keys stored in the database.
 */

import { webcrypto } from "crypto";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96 bits is recommended for GCM
const KEY_LENGTH = 256; // bits

/**
 * Derives a CryptoKey from the encryption key string using PBKDF2.
 * The key is derived deterministically so the same input always produces the same key.
 */
async function deriveKey(encryptionKey: string): Promise<webcrypto.CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(encryptionKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Use a fixed salt for deterministic key derivation
  // This is acceptable since the encryption key itself is already high-entropy
  const salt = encoder.encode("mcp-gateway-salt");

  return webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the encrypted data as a base64 string with the IV prepended.
 *
 * @param plaintext - The string to encrypt
 * @param encryptionKey - The encryption key (must be at least 32 characters)
 * @returns Base64-encoded string containing IV + ciphertext
 */
export async function encrypt(plaintext: string, encryptionKey: string): Promise<string> {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters long");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate a random IV for each encryption
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(encryptionKey);

  const ciphertext = await webcrypto.subtle.encrypt({ name: ALGORITHM, iv }, key, data);

  // Combine IV and ciphertext into a single array
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64-encoded encrypted string using AES-256-GCM.
 *
 * @param encryptedData - Base64-encoded string containing IV + ciphertext
 * @param encryptionKey - The encryption key used during encryption
 * @returns The decrypted plaintext string
 */
export async function decrypt(encryptedData: string, encryptionKey: string): Promise<string> {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("Encryption key must be at least 32 characters long");
  }

  // Decode from base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const key = await deriveKey(encryptionKey);

  const decrypted = await webcrypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
