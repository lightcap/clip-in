import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Error thrown when token decryption fails.
 * Indicates the user should reconnect their Peloton account.
 */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * Error thrown when token encryption fails.
 * Indicates a server configuration issue (missing or invalid key).
 */
export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Retrieves and validates the encryption key from environment variables.
 * @throws Error if the key is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.PELOTON_TOKEN_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error(
      "PELOTON_TOKEN_ENCRYPTION_KEY environment variable is not configured"
    );
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `Invalid encryption key length: expected 32 bytes, got ${key.length}. ` +
        "Generate a new key with: openssl rand -base64 32"
    );
  }

  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * Output format: `v1.<iv-base64>.<ciphertext-base64>.<authTag-base64>`
 * - v1 = version prefix for future key rotation
 * - iv = 12-byte random initialization vector
 * - ciphertext = encrypted data
 * - authTag = 16-byte authentication tag
 *
 * @param plaintext - The string to encrypt
 * @returns The encrypted string in the format above
 * @throws Error if encryption fails or key is not configured
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: v1.<iv>.<ciphertext>.<authTag>
  return [
    "v1",
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(".");
}

/**
 * Decrypts a ciphertext string that was encrypted with the encrypt function.
 *
 * @param ciphertext - The encrypted string in v1 format
 * @returns The decrypted plaintext string
 * @throws Error if decryption fails, format is invalid, or key is not configured
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();

  const parts = ciphertext.split(".");
  if (parts.length !== 4) {
    throw new Error(
      `Invalid ciphertext format: expected 4 parts, got ${parts.length}`
    );
  }

  const [version, ivBase64, encryptedBase64, authTagBase64] = parts;

  if (version !== "v1") {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const iv = Buffer.from(ivBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Checks if a string appears to be encrypted (starts with version prefix).
 * Useful for migration scenarios to detect unencrypted legacy data.
 *
 * @param value - The string to check
 * @returns true if the string appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith("v1.");
}

/**
 * Decrypts an encrypted token, handling legacy unencrypted tokens during migration.
 * Wraps decryption errors in DecryptionError for consistent error handling.
 *
 * @param encryptedToken - The encrypted token string (or legacy plaintext token)
 * @returns The decrypted plaintext token
 * @throws DecryptionError if decryption fails
 */
export function decryptToken(encryptedToken: string): string {
  // Handle legacy unencrypted tokens during migration
  if (!isEncrypted(encryptedToken)) {
    return encryptedToken;
  }
  try {
    return decrypt(encryptedToken);
  } catch (error) {
    console.error("Token decryption failed:", error);
    throw new DecryptionError(
      "Token decryption failed. Please reconnect your Peloton account."
    );
  }
}

/**
 * Encrypts a token for storage, wrapping errors in EncryptionError.
 *
 * @param plainToken - The plaintext token to encrypt
 * @returns The encrypted token string
 * @throws EncryptionError if encryption fails (missing or invalid key)
 */
export function encryptToken(plainToken: string): string {
  try {
    return encrypt(plainToken);
  } catch (error) {
    console.error("Token encryption failed:", error);
    throw new EncryptionError(
      "Token encryption failed. Server configuration error."
    );
  }
}
