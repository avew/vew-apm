import { describe, it, expect, vi, afterEach } from "vitest";
import { sendOpsgenie } from "./opsgenie";
import { NotifyError } from "../retry";

describe("sendOpsgenie", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function capture(
    config: Parameters<typeof sendOpsgenie>[0],
    ev: Parameters<typeof sendOpsgenie>[1],
    response = new Response("{}", { status: 202 }),
  ) {
    let url = "";
    let headers: Record<string, string> = {};
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init: { body?: string; headers?: Record<string, string> }) => {
        url = u;
        headers = init?.headers ?? {};
        body = JSON.parse(init?.body ?? "{}");
        return response;
      }),
    );
    await sendOpsgenie(config, ev);
    return { url, headers, body };
  }

  it("creates an alert with alias, priority, and GenieKey auth", async () => {
    const { url, headers, body } = await capture(
      { apiKey: "k" },
      { action: "trigger", alias: "apm-incident-7", message: "DB down", priority: "P1", source: "apm" },
    );
    expect(url).toBe("https://api.opsgenie.com/v2/alerts");
    expect(headers.authorization).toBe("GenieKey k");
    expect(body.alias).toBe("apm-incident-7");
    expect(body.priority).toBe("P1");
  });

  it("closes by alias on resolve and honors the EU region", async () => {
    const { url } = await capture(
      { apiKey: "k", region: "eu" },
      { action: "resolve", alias: "apm-incident-7", message: "x", priority: "P1", source: "apm" },
    );
    expect(url).toBe(
      "https://api.eu.opsgenie.com/v2/alerts/apm-incident-7/close?identifierType=alias",
    );
  });

  it("throws a non-retryable NotifyError on a 422", async () => {
    const err = await capture(
      { apiKey: "k" },
      { action: "trigger", alias: "a", message: "m", priority: "P1", source: "apm" },
      new Response("bad", { status: 422 }),
    ).catch((e) => e as unknown);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).retryable).toBe(false);
  });

  it("throws a retryable NotifyError on a 500", async () => {
    const err = await capture(
      { apiKey: "k" },
      { action: "trigger", alias: "a", message: "m", priority: "P1", source: "apm" },
      new Response("oops", { status: 500 }),
    ).catch((e) => e as unknown);
    expect((err as NotifyError).retryable).toBe(true);
  });
});
