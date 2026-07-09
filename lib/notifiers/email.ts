import { Resend } from "resend";

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
  if (!config.apiKey) throw new Error("Resend API key is not set");
  const resend = new Resend(config.apiKey);
  const { error } = await resend.emails.send({
    from: config.from,
    to: config.to,
    subject,
    text,
  });
  if (error) throw new Error(`resend: ${error.message}`);
}
