/** Deterministic message templates — always available, no AI required. */

export function buildQuoteSendMessage(input: {
  customerFirstName: string;
  quoteNumber: number;
  quoteUrl: string;
}) {
  return `Hola ${input.customerFirstName}, te envío el presupuesto #${input.quoteNumber}.\n\nPodés verlo y aceptarlo desde este enlace:\n${input.quoteUrl}\n\nCualquier consulta, estoy a disposición.`;
}

export function buildFollowUpMessage(input: {
  customerFirstName: string;
  quoteNumber: number;
}) {
  return `Hola ${input.customerFirstName}, ¿cómo estás? Quería consultarte si pudiste revisar el presupuesto #${input.quoteNumber} que te envié. Si tenés alguna duda sobre el trabajo o el precio, estoy a disposición.`;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
