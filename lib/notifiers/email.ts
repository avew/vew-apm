import { Resend } from "resend";
import { NotifyError } from "../retry";

export interface EmailConfig {
  apiKey: string;
  from: string;
  to: string[];
}

export async function sendEmail(
  config: EmailConfig,
  subject: string,
  text: string,
): Promise<void> {
  // Misconfiguration — retrying won't help.
  if (!config.apiKey) throw new NotifyError("Resend API key is not set", { retryable: false });
  const resend = new Resend(config.apiKey);
  const { error } = await resend.emails.send({
    from: config.from,
    to: config.to,
    subject,
    text,
  });
  // Resend surfaces auth (permanent) and rate/transient errors via `name`.
  if (error) {
    const permanent =
      error.name === "validation_error" ||
      error.name === "missing_api_key" ||
      error.name === "invalid_api_key" ||
      error.name === "restricted_api_key";
    throw new NotifyError(`resend: ${error.message}`, { retryable: !permanent });
  }
}
