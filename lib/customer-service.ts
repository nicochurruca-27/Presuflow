import { prisma } from "@/lib/prisma";
import { canCreateCustomer, CustomerLimitReachedError } from "@/lib/billing/entitlements";
import type { CustomerInput } from "@/lib/validation/customer";

/**
 * Creates a customer for a business, enforcing the plan's customer cap
 * server-side. The check runs inside the transaction that does the insert,
 * so it can't be skipped by calling the server action directly.
 *
 * Unlike the quote quota, there's no row to lock here (quotes bump
 * `Business.quoteCounter`, which serializes them). Two *simultaneous*
 * creates could therefore both read "14 of 15" and both insert, leaving a
 * business one customer over its cap. That was accepted deliberately: this
 * is a soft product cap, not money or numbering, and closing the window
 * would cost either an advisory lock or a counter column. If it ever
 * matters, those are the two fixes.
 */
export async function performCreateCustomer(businessId: string, input: CustomerInput) {
  return prisma.$transaction(async (tx) => {
    const limit = await canCreateCustomer(businessId, tx);
    if (!limit.allowed) throw new CustomerLimitReachedError(limit.reason);

    return tx.customer.create({
      data: {
        businessId,
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        notes: input.notes || null,
      },
    });
  });
}
