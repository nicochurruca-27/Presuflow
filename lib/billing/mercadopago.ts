/**
 * Mercado Pago integration placeholder for Argentina/LatAm payments.
 *
 * Not wired up: this repo ships without MERCADOPAGO_ACCESS_TOKEN. When that
 * credential is available, implement:
 *   1. POST /api/billing/mercadopago/preference — create a payment
 *      preference for the selected PlanId using the Preferences API.
 *   2. POST /api/billing/mercadopago/webhook — handle the IPN/webhook
 *      notification, verify it against the Mercado Pago API, and upsert
 *      Subscription + Payment rows accordingly.
 * The Subscription/Payment Prisma models already carry the fields needed
 * (provider, providerCustomerId, providerSubId, currentPeriodEnd).
 */
export function isMercadoPagoConfigured() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}
