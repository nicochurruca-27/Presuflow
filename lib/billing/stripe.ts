/**
 * Stripe integration placeholder for international payments.
 *
 * Not wired up: this repo ships without STRIPE_SECRET_KEY. When that
 * credential is available, implement:
 *   1. POST /api/billing/stripe/checkout — create a Checkout Session for the
 *      selected PlanId, with success/cancel URLs back into /configuracion.
 *   2. POST /api/billing/stripe/webhook — verify the signature with
 *      STRIPE_WEBHOOK_SECRET and upsert Subscription + Payment rows on
 *      checkout.session.completed / invoice.paid / customer.subscription.deleted.
 * The Subscription/Payment Prisma models already carry the fields needed
 * (provider, providerCustomerId, providerSubId, currentPeriodEnd).
 */
export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
