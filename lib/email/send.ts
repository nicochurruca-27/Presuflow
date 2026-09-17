import { Resend } from "resend";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const resend = process.env.EMAIL_API_KEY ? new Resend(process.env.EMAIL_API_KEY) : null;

/**
 * Sends a transactional email via Resend. Without EMAIL_API_KEY configured
 * (e.g. local development, or before the user has set up a provider), it
 * logs the email to the console instead of failing the calling flow.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  if (!resend) {
    console.log(`[email:dev-mode] to=${to} subject="${subject}"\n${html}`);
    return { delivered: false, reason: "EMAIL_API_KEY not configured" };
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "PresuFlow <no-reply@presuflow.app>",
      to,
      subject,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { delivered: false, reason: "send_failed" };
  }
}
