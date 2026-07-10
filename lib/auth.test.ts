import { describe, it, expect } from "vitest";
import { sessionCookieOptions } from "./auth";

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe("sessionCookieOptions", () => {
  it("is Secure when the proxy reports https", () => {
    expect(
      sessionCookieOptions(req("http://app/api", { "x-forwarded-proto": "https" })).secure,
    ).toBe(true);
  });

  it("is not Secure when the proxy reports http (plain-HTTP self-host)", () => {
    expect(
      sessionCookieOptions(req("http://vps:3000/api", { "x-forwarded-proto": "http" })).secure,
    ).toBe(false);
  });

  it("uses the first value of a forwarded-proto list", () => {
    expect(
      sessionCookieOptions(req("http://app/api", { "x-forwarded-proto": "https, http" })).secure,
    ).toBe(true);
  });

  it("falls back to the request URL protocol when no proxy header", () => {
    expect(sessionCookieOptions(req("https://app/api")).secure).toBe(true);
    expect(sessionCookieOptions(req("http://app/api")).secure).toBe(false);
  });

  it("always sets httpOnly + lax + root path", () => {
    const o = sessionCookieOptions(req("http://app/api"));
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
  });
});
