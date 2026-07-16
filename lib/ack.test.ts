import { describe, it, expect, beforeAll, afterEach } from "vitest";

// A fixed key so tokens are deterministic within the test.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "ack-test-key";
});

describe("ack tokens", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it("verifies a token it produced", async () => {
    const { ackToken, verifyAckToken } = await import("./ack");
    const tok = ackToken(42);
    expect(verifyAckToken(42, tok)).toBe(true);
  });

  it("rejects a token for a different incident", async () => {
    const { ackToken, verifyAckToken } = await import("./ack");
    const tok = ackToken(42);
    expect(verifyAckToken(43, tok)).toBe(false);
  });

  it("rejects a tampered / empty token", async () => {
    const { ackToken, verifyAckToken } = await import("./ack");
    const tok = ackToken(42);
    expect(verifyAckToken(42, tok + "x")).toBe(false);
    expect(verifyAckToken(42, "")).toBe(false);
  });

  it("returns null ackUrl when APP_BASE_URL is unset", async () => {
    const { ackUrl } = await import("./ack");
    expect(ackUrl(42)).toBeNull();
  });

  it("builds an absolute ackUrl with a token when APP_BASE_URL is set", async () => {
    process.env.APP_BASE_URL = "https://apm.example.com/";
    const { ackUrl, ackToken } = await import("./ack");
    const url = ackUrl(42);
    expect(url).toBe(`https://apm.example.com/api/ack/42?token=${ackToken(42)}`);
  });
});
