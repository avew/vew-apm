import { Resend } from "resend";

export async function sendEmail(
  config: { from: string; to: string[] },
  subject: string,
  text: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: config.from,
    to: config.to,
    subject,
    text,
  });
  if (error) throw new Error(`resend: ${error.message}`);
}
