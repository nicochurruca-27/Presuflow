import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log";

export type ProductEventName =
  | "signup"
  | "onboarding_completed"
  | "quote_created"
  | "quote_sent"
  | "quote_viewed"
  | "quote_accepted"
  | "quote_rejected"
  | "followup_generated"
  | "followup_sent"
  | "subscription_started"
  | "subscription_cancelled";

/** Fire-and-forget product analytics. Never throws — a tracking failure must never break a user flow. */
export async function track(
  name: ProductEventName,
  businessId: string | null,
  metadata?: Record<string, unknown>
) {
  try {
    await prisma.productEvent.create({
      data: { name, businessId, metadata: (metadata as Prisma.InputJsonValue) ?? undefined },
    });
  } catch (err) {
    logError("analytics", err, { event: name });
  }
}
