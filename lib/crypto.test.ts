import { describe, it, expect, beforeAll } from "vitest";

// Pin a deterministic key before importing the module (key load is lazy+cached).
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "unit-test-encryption-key";
});

const { encryptSecret, decryptSecret, isEncrypted } = await import("./crypto");

describe("crypto", () => {
  it("round-trips an object through encrypt/decrypt", () => {
    const secret = { botToken: "123:ABCdef", chatId: -1001234567890 };
    const enc = encryptSecret(secret);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("ABCdef"); // ciphertext, not plaintext
    expect(decryptSecret(enc)).toEqual(secret);
  });

  it("produces a fresh IV each call (no deterministic ciphertext)", () => {
    const a = encryptSecret({ k: "v" });
    const b = encryptSecret({ k: "v" });
    expect(a).not.toEqual(b);
    expect(decryptSecret(a)).toEqual(decryptSecret(b));
  });

  it("passes through legacy plaintext objects unchanged", () => {
    const legacy = { apiKey: "re_plain", from: "a@b.c", to: ["x@y.z"] };
    expect(decryptSecret(legacy)).toEqual(legacy);
    expect(isEncrypted(legacy)).toBe(false);
  });

  it("passes through non-enc strings unchanged", () => {
    expect(decryptSecret("just-a-string")).toBe("just-a-string");
    expect(isEncrypted("just-a-string")).toBe(false);
  });

  it("detects tampering via the GCM auth tag", () => {
    const enc = encryptSecret({ k: "v" });
    // flip the last base64 char of the ciphertext segment
    const flipped = enc.slice(0, -1) + (enc.at(-1) === "A" ? "B" : "A");
    expect(() => decryptSecret(flipped)).toThrow();
  });

  it("throws on malformed ciphertext", () => {
    expect(() => decryptSecret("enc:v1:onlyonepart")).toThrow(/malformed/);
  });
});
