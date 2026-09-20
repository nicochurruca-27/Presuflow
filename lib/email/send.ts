import { Resend } from "resend";
import { describeError, logError } from "@/lib/log";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const resend = process.env.EMAIL_API_KEY ? new Resend(process.env.EMAIL_API_KEY) : null;

/**
 * Sends a transactional email via Resend.
 *
 * Email is optional by design: without EMAIL_API_KEY the app still works,
 * and the calling flow is never failed by a missing provider. What changes
 * with this block is *what gets printed* in that case. Dumping the rendered
 * HTML is genuinely useful on a laptop — it's how you click a password-reset
 * link with no provider configured — but that body contains the reset token,
 * so in production it's reduced to the fact that an email couldn't be sent.
 * A server log is not the place for a working credential.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput) {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[email] EMAIL_API_KEY no está configurada: el email no se envió", {
        to,
        subject,
      });
    } else {
      console.log(`[email:dev-mode] to=${to} subject="${subject}"\n${html}`);
    }
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
      // Summarised rather than dumped: the provider's error object can carry
      // the request it made, and that request was authenticated.
      console.error("[email] provider rejected the message", {
        to,
        subject,
        ...describeError(error),
      });
      return { delivered: false, reason: error.message ?? "provider_error" };
    }
    return { delivered: true };
  } catch (err) {
    logError("email", err, { to, subject });
    return { delivered: false, reason: "send_failed" };
  }
}
