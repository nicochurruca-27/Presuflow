import { getAppUrl } from "@/lib/env";

const APP_URL = getAppUrl();

function layout(title: string, body: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
    <h1 style="font-size:20px;margin-bottom:4px;color:#0f172a;">PresuFlow</h1>
    <h2 style="font-size:16px;font-weight:600;margin-top:24px;">${title}</h2>
    <div style="font-size:14px;line-height:1.6;color:#334155;">${body}</div>
    <p style="margin-top:32px;font-size:12px;color:#94a3b8;">PresuFlow — presupuestos profesionales en segundos.</p>
  </div>`;
}

export function welcomeEmail(name: string) {
  return {
    subject: "Bienvenido a PresuFlow",
    html: layout(
      `¡Hola ${name}!`,
      `<p>Tu cuenta de PresuFlow ya está lista. Ahora podés crear tu negocio y armar tu primer presupuesto en menos de un minuto.</p>
       <p><a href="${APP_URL}/dashboard" style="color:#2563eb;">Ir a mi cuenta →</a></p>`
    ),
  };
}

export function quoteAcceptedEmail(ownerName: string, customerName: string, quoteNumber: number, quoteUrl: string) {
  return {
    subject: `${customerName} aceptó el presupuesto #${quoteNumber}`,
    html: layout(
      "¡Buenas noticias!",
      `<p>Hola ${ownerName}, <strong>${customerName}</strong> aceptó el presupuesto <strong>#${quoteNumber}</strong>.</p>
       <p><a href="${quoteUrl}" style="color:#2563eb;">Ver detalle →</a></p>`
    ),
  };
}

export function passwordResetEmail(resetUrl: string) {
  return {
    subject: "Recuperá tu contraseña de PresuFlow",
    html: layout(
      "Recuperación de cuenta",
      `<p>Recibimos una solicitud para restablecer tu contraseña. Si fuiste vos, hacé clic abajo. El enlace vence en 1 hora.</p>
       <p><a href="${resetUrl}" style="color:#2563eb;">Restablecer contraseña →</a></p>
       <p>Si no pediste esto, ignorá este email.</p>`
    ),
  };
}
