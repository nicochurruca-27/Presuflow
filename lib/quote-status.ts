import { QuoteStatus } from "@prisma/client";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  VIEWED: "Visto",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
};

export const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-brand-light text-brand-dark",
  VIEWED: "bg-warning-light text-warning",
  ACCEPTED: "bg-success-light text-success",
  REJECTED: "bg-danger-light text-danger",
  EXPIRED: "bg-slate-100 text-muted",
  CANCELLED: "bg-slate-100 text-muted",
};
