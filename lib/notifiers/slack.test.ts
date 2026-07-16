import { describe, it, expect, vi, afterEach } from "vitest";
import { sendSlack, type SlackConfig } from "./slack";
import { NotifyError } from "../retry";

describe("sendSlack", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Stub fetch, return the parsed request body + the URL it posted to. */
  async function capture(
    config: SlackConfig,
    message: Parameters<typeof sendSlack>[1],
    response = new Response("ok", { status: 200 }),
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
    await sendSlack(config, message);
    return { url, body };
  }

  it("posts an attachment with text and color to the webhook URL", async () => {
    const { url, body } = await capture(
      { webhookUrl: "https://hooks.slack.com/services/T/B/xxx" },
      { title: "PostgreSQL is DOWN", text: "*db* alert", color: "#c6394f" },
    );
    expect(url).toBe("https://hooks.slack.com/services/T/B/xxx");
    const attachments = body.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].text).toBe("*db* alert");
    expect(attachments[0].color).toBe("#c6394f");
    expect(attachments[0].title).toBe("PostgreSQL is DOWN");
    // body must render Slack mrkdwn
    expect(attachments[0].mrkdwn_in).toContain("text");
  });

  it("includes username and icon_emoji when configured", async () => {
    const { body } = await capture(
      {
        webhookUrl: "https://hooks.slack.com/services/T/B/xxx",
        username: "Vew APM",
        iconEmoji: ":rotating_light:",
      },
      { text: "hi" },
    );
    expect(body.username).toBe("Vew APM");
    expect(body.icon_emoji).toBe(":rotating_light:");
  });

  it("omits username/icon_emoji when not configured", async () => {
    const { body } = await capture(
      { webhookUrl: "https://hooks.slack.com/services/T/B/xxx" },
      { text: "hi" },
    );
    expect(body).not.toHaveProperty("username");
    expect(body).not.toHaveProperty("icon_emoji");
  });

  it("throws a retryable NotifyError on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    await expect(
      sendSlack({ webhookUrl: "https://hooks.slack.com/x" }, { text: "hi" }),
    ).rejects.toMatchObject({ name: "NotifyError", retryable: true });
  });

  /** Stub fetch to return `response`, then send and capture the thrown error. */
  async function sendExpectingError(response: Response) {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    return sendSlack(
      { webhookUrl: "https://hooks.slack.com/x" },
      { text: "hi" },
    ).catch((e) => e as unknown);
  }

  it("throws a non-retryable NotifyError on a 400 (bad payload)", async () => {
    const err = await sendExpectingError(
      new Response("invalid_payload", { status: 400 }),
    );
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).retryable).toBe(false);
    expect((err as NotifyError).status).toBe(400);
  });

  it("throws a retryable NotifyError on a 429 (rate limited)", async () => {
    const err = await sendExpectingError(
      new Response("rate_limited", { status: 429 }),
    );
    expect((err as NotifyError).retryable).toBe(true);
  });
});
