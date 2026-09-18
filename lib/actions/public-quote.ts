"use server";

import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics";
import { sendEmail } from "@/lib/email/send";
import { quoteAcceptedEmail } from "@/lib/email/templates";
import { isFinalized } from "@/lib/quote-service";

export async function acceptQuoteAction(token: string) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { customer: true, business: { include: { owner: true } } },
  });
  if (!quote) return;
  if (isFinalized(quote.status)) return;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "ACCEPTED" } }),
  ]);

  await track("quote_accepted", quote.businessId, { quoteId: quote.id });

  const email = quoteAcceptedEmail(
    quote.business.owner.name,
    quote.customer.name,
    quote.number,
    `${getAppUrl()}/presupuestos/${quote.id}`
  );
  await sendEmail({ to: quote.business.owner.email, subject: email.subject, html: email.html });

  redirect(`/q/${token}`);
}

export async function rejectQuoteAction(token: string) {
  const quote = await prisma.quote.findUnique({ where: { publicToken: token } });
  if (!quote) return;
  if (isFinalized(quote.status)) return;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "REJECTED", rejectedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "REJECTED" } }),
  ]);

  await track("quote_rejected", quote.businessId, { quoteId: quote.id });
  redirect(`/q/${token}`);
}
