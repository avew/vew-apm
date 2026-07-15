import { describe, it, expect } from "vitest";
import { buildAuthHeaders } from "./auth-header";

const base = {
  authType: "none" as string | null,
  authUsername: null as string | null,
  authHeaderName: null as string | null,
  authHeaderValue: null as string | null,
};

describe("buildAuthHeaders", () => {
  it("none → no headers", () => {
    expect(buildAuthHeaders(base)).toEqual({});
  });

  it("header → custom name/value", () => {
    expect(
      buildAuthHeaders({ ...base, authType: "header", authHeaderName: "X-Key", authHeaderValue: "abc" }),
    ).toEqual({ "X-Key": "abc" });
  });

  it("header with missing pieces → empty", () => {
    expect(buildAuthHeaders({ ...base, authType: "header", authHeaderName: "X-Key" })).toEqual({});
  });

  it("bearer → Authorization: Bearer", () => {
    expect(
      buildAuthHeaders({ ...base, authType: "bearer", authHeaderValue: "tok123" }),
    ).toEqual({ Authorization: "Bearer tok123" });
  });

  it("basic → base64(user:pass)", () => {
    const h = buildAuthHeaders({
      ...base,
      authType: "basic",
      authUsername: "alice",
      authHeaderValue: "s3cret",
    });
    expect(h.Authorization).toBe("Basic " + Buffer.from("alice:s3cret").toString("base64"));
  });
});
