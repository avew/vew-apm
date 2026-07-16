import { describe, it, expect, vi, afterEach } from "vitest";
import { sendDiscord, type DiscordConfig } from "./discord";
import { NotifyError } from "../retry";

describe("sendDiscord", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function capture(
    config: DiscordConfig,
    message: Parameters<typeof sendDiscord>[1],
    response = new Response(null, { status: 204 }),
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
    await sendDiscord(config, message);
    return { url, body };
  }

  it("posts an embed with the message and an integer color", async () => {
    const { url, body } = await capture(
      { webhookUrl: "https://discord.com/api/webhooks/1/tok" },
      { title: "PostgreSQL is DOWN", text: "*db* alert", color: "#ef4444" },
    );
    expect(url).toBe("https://discord.com/api/webhooks/1/tok");
    const embeds = body.embeds as Array<Record<string, unknown>>;
    expect(embeds).toHaveLength(1);
    expect(embeds[0].description).toBe("*db* alert");
    expect(embeds[0].title).toBe("PostgreSQL is DOWN");
    // "#ef4444" → 0xef4444 → 15680580
    expect(embeds[0].color).toBe(15680580);
  });

  it("includes username override when configured", async () => {
    const { body } = await capture(
      { webhookUrl: "https://discord.com/api/webhooks/1/tok", username: "Vew APM" },
      { text: "hi" },
    );
    expect(body.username).toBe("Vew APM");
  });

  it("omits color when none is given", async () => {
    const { body } = await capture(
      { webhookUrl: "https://discord.com/api/webhooks/1/tok" },
      { text: "hi" },
    );
    const embeds = body.embeds as Array<Record<string, unknown>>;
    expect(embeds[0]).not.toHaveProperty("color");
  });

  async function sendExpectingError(response: Response) {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    return sendDiscord(
      { webhookUrl: "https://discord.com/api/webhooks/1/tok" },
      { text: "hi" },
    ).catch((e) => e as unknown);
  }

  it("throws a retryable NotifyError on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    await expect(
      sendDiscord({ webhookUrl: "https://discord.com/x" }, { text: "hi" }),
    ).rejects.toMatchObject({ name: "NotifyError", retryable: true });
  });

  it("throws a non-retryable NotifyError on a 400", async () => {
    const err = await sendExpectingError(new Response("bad", { status: 400 }));
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).retryable).toBe(false);
  });

  it("throws a retryable NotifyError on a 429", async () => {
    const err = await sendExpectingError(new Response("slow down", { status: 429 }));
    expect((err as NotifyError).retryable).toBe(true);
  });
});
