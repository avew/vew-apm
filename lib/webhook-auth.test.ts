import { describe, it, expect, vi, afterEach } from "vitest";
import { sendWebhook } from "./notifiers/webhook";

describe("sendWebhook auth", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function capture(config: Parameters<typeof sendWebhook>[0]) {
    let headers: Record<string, string> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { headers?: Record<string, string> }) => {
        headers = init?.headers ?? {};
        return new Response("ok", { status: 200 });
      }),
    );
    await sendWebhook(config, { test: true });
    return headers;
  }

  it("adds a Bearer Authorization header", async () => {
    const h = await capture({ url: "http://x", authType: "bearer", authHeaderValue: "tok" });
    expect(h.Authorization).toBe("Bearer tok");
  });

  it("adds a custom auth header", async () => {
    const h = await capture({
      url: "http://x",
      authType: "header",
      authHeaderName: "X-Key",
      authHeaderValue: "abc",
    });
    expect(h["X-Key"]).toBe("abc");
  });

  it("sends no auth header when authType is none/unset", async () => {
    const h = await capture({ url: "http://x" });
    expect(h.Authorization).toBeUndefined();
  });
});
