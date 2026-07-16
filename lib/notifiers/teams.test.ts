import { describe, it, expect, vi, afterEach } from "vitest";
import { sendTeams, type TeamsConfig } from "./teams";
import { NotifyError } from "../retry";

describe("sendTeams", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function capture(
    config: TeamsConfig,
    message: Parameters<typeof sendTeams>[1],
    response = new Response("1", { status: 200 }),
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
    await sendTeams(config, message);
    return { url, body };
  }

  it("posts a MessageCard with themeColor (no leading #) and the body text", async () => {
    const { url, body } = await capture(
      { webhookUrl: "https://outlook.office.com/webhook/xxx" },
      { title: "PostgreSQL is DOWN", text: "db alert", color: "#ef4444" },
    );
    expect(url).toBe("https://outlook.office.com/webhook/xxx");
    expect(body["@type"]).toBe("MessageCard");
    expect(body.themeColor).toBe("ef4444");
    expect(body.summary).toBe("PostgreSQL is DOWN");
    const sections = body.sections as Array<Record<string, unknown>>;
    expect(sections[0].activityTitle).toBe("PostgreSQL is DOWN");
    expect(sections[0].text).toBe("db alert");
  });

  it("falls back to a default title when none is given", async () => {
    const { body } = await capture(
      { webhookUrl: "https://outlook.office.com/webhook/xxx" },
      { text: "hi" },
    );
    expect(body.summary).toBe("Vew APM");
  });

  it("omits themeColor when none is given", async () => {
    const { body } = await capture(
      { webhookUrl: "https://outlook.office.com/webhook/xxx" },
      { text: "hi" },
    );
    expect(body).not.toHaveProperty("themeColor");
  });

  async function sendExpectingError(response: Response) {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    return sendTeams(
      { webhookUrl: "https://outlook.office.com/webhook/xxx" },
      { text: "hi" },
    ).catch((e) => e as unknown);
  }

  it("throws a retryable NotifyError on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      }),
    );
    await expect(
      sendTeams({ webhookUrl: "https://outlook.office.com/x" }, { text: "hi" }),
    ).rejects.toMatchObject({ name: "NotifyError", retryable: true });
  });

  it("throws a non-retryable NotifyError on a 400", async () => {
    const err = await sendExpectingError(new Response("bad", { status: 400 }));
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).retryable).toBe(false);
  });

  it("throws a retryable NotifyError on a 500", async () => {
    const err = await sendExpectingError(new Response("oops", { status: 500 }));
    expect((err as NotifyError).retryable).toBe(true);
  });
});
