import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encrypt, decrypt, isEncrypted, decryptToken, DecryptionError, encryptToken, EncryptionError } from "./crypto";

// Test encryption key (32 bytes, base64 encoded)
// Generated with: openssl rand -base64 32
const TEST_KEY = "FYGUgCri2FR/S/fqKg3KDNCzhnn/LCVk+5VoQ8T3Xrk=";
// A different valid 32-byte key for testing wrong key scenarios
const WRONG_KEY = "1234567890123456789012345678901234567890123=";

describe("crypto utilities", () => {
  beforeEach(() => {
    vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("encrypt", () => {
    it("should encrypt a plaintext string", () => {
      const plaintext = "my-secret-token";
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith("v1.")).toBe(true);
    });

    it("should produce different ciphertexts for the same plaintext (random IV)", () => {
      const plaintext = "my-secret-token";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should handle empty strings", () => {
      const encrypted = encrypt("");
      expect(encrypted.startsWith("v1.")).toBe(true);
    });

    it("should handle unicode characters", () => {
      const plaintext = "token-with-emoji-🔐";
      const encrypted = encrypt(plaintext);
      expect(encrypted.startsWith("v1.")).toBe(true);
    });

    it("should handle long strings", () => {
      const plaintext = "a".repeat(10000);
      const encrypted = encrypt(plaintext);
      expect(encrypted.startsWith("v1.")).toBe(true);
    });

    it("should throw if encryption key is not configured", () => {
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", "");

      expect(() => encrypt("test")).toThrow(
        "PELOTON_TOKEN_ENCRYPTION_KEY environment variable is not configured"
      );
    });

    it("should throw if encryption key is invalid length", () => {
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", "dG9vLXNob3J0"); // too short

      expect(() => encrypt("test")).toThrow("Invalid encryption key length");
    });
  });

  describe("decrypt", () => {
    it("should decrypt an encrypted string", () => {
      const plaintext = "my-secret-token";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle unicode characters", () => {
      const plaintext = "token-with-emoji-🔐";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", () => {
      const plaintext = "a".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should throw on invalid format (missing parts)", () => {
      expect(() => decrypt("v1.only-two-parts")).toThrow(
        "Invalid ciphertext format"
      );
    });

    it("should throw on unsupported version", () => {
      expect(() => decrypt("v2.a.b.c")).toThrow(
        "Unsupported encryption version"
      );
    });

    it("should throw on tampered ciphertext", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(".");
      // Tamper with the ciphertext part
      parts[2] = "dGFtcGVyZWQ="; // base64 of "tampered"
      const tampered = parts.join(".");

      expect(() => decrypt(tampered)).toThrow();
    });

    it("should throw on tampered auth tag", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(".");
      // Tamper with the auth tag
      parts[3] = "AAAAAAAAAAAAAAAAAAAAAA=="; // valid base64, wrong tag
      const tampered = parts.join(".");

      expect(() => decrypt(tampered)).toThrow();
    });

    it("should throw if encryption key is not configured", () => {
      const encrypted = encrypt("test");
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", "");

      expect(() => decrypt(encrypted)).toThrow(
        "PELOTON_TOKEN_ENCRYPTION_KEY environment variable is not configured"
      );
    });

    it("should throw when decrypting with wrong key", () => {
      // Encrypt with the original key
      const encrypted = encrypt("test");

      // Try to decrypt with a different key
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", WRONG_KEY);

      // GCM mode should fail authentication when using wrong key
      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted strings", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plain strings", () => {
      expect(isEncrypted("not-encrypted")).toBe(false);
      expect(isEncrypted("Bearer some-token")).toBe(false);
      expect(isEncrypted("")).toBe(false);
    });

    it("should return true for strings starting with v1.", () => {
      expect(isEncrypted("v1.something")).toBe(true);
    });
  });

  describe("round-trip encryption/decryption", () => {
    it("should correctly round-trip various test cases", () => {
      const testCases = [
        "simple-token",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        JSON.stringify({ token: "value", nested: { data: true } }),
        "special-chars-!@#$%^&*()",
        "newlines\nand\ttabs",
      ];

      for (const original of testCases) {
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
      }
    });
  });

  describe("decryptToken", () => {
    it("should decrypt encrypted tokens", () => {
      const plaintext = "my-secret-token";
      const encrypted = encrypt(plaintext);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should pass through legacy unencrypted tokens", () => {
      const legacyToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = decryptToken(legacyToken);

      expect(result).toBe(legacyToken);
    });

    it("should throw DecryptionError on decryption failure", () => {
      const encrypted = encrypt("test");

      // Switch to wrong key
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", WRONG_KEY);

      expect(() => decryptToken(encrypted)).toThrow(DecryptionError);
      expect(() => decryptToken(encrypted)).toThrow(
        "Token decryption failed. Please reconnect your Peloton account."
      );
    });

    it("should throw DecryptionError on corrupted ciphertext", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(".");
      parts[2] = "corrupted-data";
      const corrupted = parts.join(".");

      expect(() => decryptToken(corrupted)).toThrow(DecryptionError);
    });
  });

  describe("encryptToken", () => {
    it("should encrypt tokens successfully", () => {
      const plaintext = "my-secret-token";
      const encrypted = encryptToken(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith("v1.")).toBe(true);
    });

    it("should produce decryptable output", () => {
      const plaintext = "my-secret-token";
      const encrypted = encryptToken(plaintext);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should throw EncryptionError when key is not configured", () => {
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", "");

      expect(() => encryptToken("test")).toThrow(EncryptionError);
      expect(() => encryptToken("test")).toThrow(
        "Token encryption failed. Server configuration error."
      );
    });

    it("should throw EncryptionError when key is invalid", () => {
      vi.stubEnv("PELOTON_TOKEN_ENCRYPTION_KEY", "dG9vLXNob3J0"); // too short

      expect(() => encryptToken("test")).toThrow(EncryptionError);
      expect(() => encryptToken("test")).toThrow(
        "Token encryption failed. Server configuration error."
      );
    });
  });
});
