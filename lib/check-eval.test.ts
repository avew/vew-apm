import { describe, it, expect } from "vitest";
import { getByPath } from "./jsonpath";
import { statusMatches, valueIsUp, evaluateHttp, evaluateJson } from "./check-eval";

describe("getByPath", () => {
  const obj = { health: "green", queue: { size: 12 }, arr: [{ x: 1 }, { x: 2 }] };
  it("reads dot, bracket, index, and $ prefix", () => {
    expect(getByPath(obj, "$.health")).toBe("green");
    expect(getByPath(obj, "queue.size")).toBe(12);
    expect(getByPath(obj, "arr[1].x")).toBe(2);
    expect(getByPath(obj, '["health"]')).toBe("green");
  });
  it("returns undefined on a miss", () => {
    expect(getByPath(obj, "queue.depth")).toBeUndefined();
    expect(getByPath(obj, "nope.deep.path")).toBeUndefined();
  });
});

describe("statusMatches", () => {
  it("defaults to 2xx", () => {
    expect(statusMatches(200, null)).toBe(true);
    expect(statusMatches(204, "2xx")).toBe(true);
    expect(statusMatches(500, "")).toBe(false);
  });
  it("exact + range", () => {
    expect(statusMatches(201, "201")).toBe(true);
    expect(statusMatches(200, "201")).toBe(false);
    expect(statusMatches(203, "200-204")).toBe(true);
    expect(statusMatches(205, "200-204")).toBe(false);
  });
  it("null code never matches", () => {
    expect(statusMatches(null, "2xx")).toBe(false);
  });
});

describe("valueIsUp", () => {
  it("uses the healthy set by default", () => {
    expect(valueIsUp("green", null)).toBe(true);
    expect(valueIsUp("UP", null)).toBe(true);
    expect(valueIsUp(true, null)).toBe(true);
    expect(valueIsUp("red", null)).toBe(false);
    expect(valueIsUp(null, null)).toBe(false);
  });
  it("compares to an explicit up value (case-insensitive)", () => {
    expect(valueIsUp("Green", "green")).toBe(true);
    expect(valueIsUp("amber", "green")).toBe(false);
  });
});

describe("evaluateHttp", () => {
  it("up on 2xx, down otherwise", () => {
    expect(evaluateHttp(200, "hi", { expectStatus: null, keyword: null }).up).toBe(true);
    expect(evaluateHttp(503, "", { expectStatus: null, keyword: null }).up).toBe(false);
  });
  it("keyword must be present", () => {
    expect(evaluateHttp(200, "pong", { expectStatus: null, keyword: "pong" }).up).toBe(true);
    const v = evaluateHttp(200, "error page", { expectStatus: null, keyword: "pong" });
    expect(v.up).toBe(false);
    expect(v.reason).toMatch(/keyword/);
  });
});

describe("evaluateJson", () => {
  const body = JSON.stringify({ health: "green", db: { ok: true } });
  it("up when the path value is healthy", () => {
    expect(evaluateJson(200, body, { statusPath: "$.health", statusUpValue: null, keyword: null }).up).toBe(true);
    expect(evaluateJson(200, body, { statusPath: "db.ok", statusUpValue: null, keyword: null }).up).toBe(true);
  });
  it("down when path value fails, missing, non-2xx, or not JSON", () => {
    expect(evaluateJson(200, JSON.stringify({ health: "red" }), { statusPath: "$.health", statusUpValue: null, keyword: null }).up).toBe(false);
    expect(evaluateJson(200, body, { statusPath: "$.missing", statusUpValue: null, keyword: null }).up).toBe(false);
    expect(evaluateJson(500, body, { statusPath: "$.health", statusUpValue: null, keyword: null }).up).toBe(false);
    expect(evaluateJson(200, "not json", { statusPath: "$.health", statusUpValue: null, keyword: null }).up).toBe(false);
  });
  it("honors an explicit up value", () => {
    expect(evaluateJson(200, JSON.stringify({ s: "RUNNING" }), { statusPath: "s", statusUpValue: "running", keyword: null }).up).toBe(true);
  });
});
