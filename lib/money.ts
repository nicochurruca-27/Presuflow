const LOCALE_BY_CURRENCY: Record<string, string> = {
  ARS: "es-AR",
  USD: "en-US",
  EUR: "de-DE",
  MXN: "es-MX",
  CLP: "es-CL",
  COP: "es-CO",
  UYU: "es-UY",
};

export function formatMoney(amount: number, currency: string) {
  const locale = LOCALE_BY_CURRENCY[currency] ?? "es-AR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
