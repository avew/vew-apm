import { describe, it, expect } from "vitest";
import { readBodyCapped, MAX_BODY_BYTES } from "./checker";

describe("readBodyCapped", () => {
  it("returns the body text for a small response", async () => {
    const res = new Response(JSON.stringify({ status: "UP" }));
    const { text, tooLarge } = await readBodyCapped(res);
    expect(tooLarge).toBe(false);
    expect(text).toBe('{"status":"UP"}');
  });

  it("rejects early via Content-Length over the cap (without reading)", async () => {
    const res = new Response("x", {
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    });
    const { text, tooLarge } = await readBodyCapped(res);
    expect(tooLarge).toBe(true);
    expect(text).toBeNull();
  });

  it("stops mid-stream when an unsized body exceeds the cap", async () => {
    // A stream has no Content-Length, so the streaming guard must catch it.
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1024));
        c.close();
      },
    });
    const res = new Response(stream);
    const { text, tooLarge } = await readBodyCapped(res);
    expect(tooLarge).toBe(true);
    expect(text).toBeNull();
  });
});
