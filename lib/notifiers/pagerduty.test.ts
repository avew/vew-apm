import { describe, it, expect, vi, afterEach } from "vitest";
import { sendPagerDuty } from "./pagerduty";
import { NotifyError } from "../retry";

describe("sendPagerDuty", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function capture(
    ev: Parameters<typeof sendPagerDuty>[1],
    response = new Response("{}", { status: 202 }),
  ) {
    let url = "";
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init: { body?: string }) => {
        url = u;
        body = JSON.parse(init?.body ?? "{}");
        return response;
      }),
    );
    await sendPagerDuty({ routingKey: "rk" }, ev);
    return { url, body };
  }

  it("sends a trigger with routing key, dedup key, and payload", async () => {
    const { url, body } = await capture({
      action: "trigger",
      dedupKey: "apm-incident-7",
      summary: "PostgreSQL is DOWN",
      severity: "critical",
      source: "db",
    });
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    expect(body.routing_key).toBe("rk");
    expect(body.event_action).toBe("trigger");
    expect(body.dedup_key).toBe("apm-incident-7");
    expect((body.payload as Record<string, unknown>).severity).toBe("critical");
  });

  it("sends a resolve without a payload but with the dedup key", async () => {
    const { body } = await capture({
      action: "resolve",
      dedupKey: "apm-incident-7",
      summary: "x",
      severity: "critical",
      source: "db",
    });
    expect(body.event_action).toBe("resolve");
    expect(body.dedup_key).toBe("apm-incident-7");
    expect(body).not.toHaveProperty("payload");
  });

  it("throws a non-retryable NotifyError on a 400", async () => {
    const err = await capture(
      { action: "trigger", dedupKey: "d", summary: "s", severity: "critical", source: "x" },
      new Response("bad", { status: 400 }),
    ).catch((e) => e as unknown);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).retryable).toBe(false);
  });

  it("throws a retryable NotifyError on a 429", async () => {
    const err = await capture(
      { action: "trigger", dedupKey: "d", summary: "s", severity: "critical", source: "x" },
      new Response("slow", { status: 429 }),
    ).catch((e) => e as unknown);
    expect((err as NotifyError).retryable).toBe(true);
  });
});
