import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.SERVER_ENCRYPTION_SECRET = "a".repeat(64); // valid 64-hex-char secret
});

describe("encrypt / decrypt round-trips", () => {
  it("decrypts back to the original plaintext", () => {
    const plaintext = "hello world";
    const ciphertext = encrypt(plaintext, "user-1");
    expect(decrypt(ciphertext, "user-1")).toBe(plaintext);
  });

  it("handles empty string", () => {
    const ciphertext = encrypt("", "user-1");
    expect(decrypt(ciphertext, "user-1")).toBe("");
  });

  it("handles unicode content", () => {
    const plaintext = "Éire 🇮🇪 — ogham ᚑᚌᚆᚐᚋ";
    const ciphertext = encrypt(plaintext, "user-unicode");
    expect(decrypt(ciphertext, "user-unicode")).toBe(plaintext);
  });

  it("handles multiline content", () => {
    const plaintext = "line one\nline two\nline three";
    const ciphertext = encrypt(plaintext, "user-multiline");
    expect(decrypt(ciphertext, "user-multiline")).toBe(plaintext);
  });

  it("produces different ciphertexts on each call (random IV)", () => {
    const a = encrypt("same plaintext", "user-1");
    const b = encrypt("same plaintext", "user-1");
    expect(a).not.toBe(b);
  });

  it("produces different ciphertexts for different users (key isolation)", () => {
    const ct1 = encrypt("secret", "user-alice");
    const ct2 = encrypt("secret", "user-bob");
    expect(ct1).not.toBe(ct2);
  });

  it("cannot decrypt with a different user id", () => {
    const ciphertext = encrypt("private data", "user-alice");
    expect(() => decrypt(ciphertext, "user-bob")).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("data", "user-1");
    // flip the last byte via base64 manipulation
    const buf = Buffer.from(ciphertext, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered, "user-1")).toThrow();
  });

  it("encrypts a realistic long payload", () => {
    const plaintext = "x".repeat(10_000);
    const ciphertext = encrypt(plaintext, "user-bulk");
    expect(decrypt(ciphertext, "user-bulk")).toBe(plaintext);
  });
});

describe("error handling", () => {
  it("throws when SERVER_ENCRYPTION_SECRET is missing", () => {
    const saved = process.env.SERVER_ENCRYPTION_SECRET;
    delete process.env.SERVER_ENCRYPTION_SECRET;
    expect(() => encrypt("test", "user-1")).toThrow(/SERVER_ENCRYPTION_SECRET/);
    process.env.SERVER_ENCRYPTION_SECRET = saved;
  });
});
