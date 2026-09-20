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
    // Resend reports API-level failures (bad key, unverified domain, rate
    // limit, invalid recipient) in the response body rather than by
    // throwing, so the error field has to be checked explicitly — otherwise
    // a mail that never left is reported as delivered and logged nowhere.
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "PresuFlow <no-reply@presuflow.app>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email] provider rejected the message", { to, subject, error });
      return { delivered: false, reason: error.message ?? "provider_error" };
    }
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { delivered: false, reason: "send_failed" };
  }
}
