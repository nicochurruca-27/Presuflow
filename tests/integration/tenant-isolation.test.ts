import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const userIds: string[] = [];

async function makeBusiness(tag: string) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: { name: `Owner ${tag}`, email: `isolation_${tag}_${Date.now()}@test.local`, passwordHash },
  });
  userIds.push(user.id);
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: `Business ${tag}`, currency: "ARS" },
  });
  return business;
}

describe("multi-tenant isolation", () => {
  afterAll(async () => {
    // Deleting the users cascades to their businesses and everything below.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("scopes customers strictly by businessId", async () => {
    const businessA = await makeBusiness("A");
    const businessB = await makeBusiness("B");

    const customer = await prisma.customer.create({
      data: { businessId: businessA.id, name: "Cliente secreto de A" },
    });

    const visibleToOwner = await prisma.customer.findFirst({
      where: { id: customer.id, businessId: businessA.id },
    });
    expect(visibleToOwner?.id).toBe(customer.id);

    const visibleToOther = await prisma.customer.findFirst({
      where: { id: customer.id, businessId: businessB.id },
    });
    expect(visibleToOther).toBeNull();
  });

  it("scopes quotes strictly by businessId and keeps per-business numbering", async () => {
    const businessA = await makeBusiness("A2");
    const businessB = await makeBusiness("B2");
    const customerA = await prisma.customer.create({
      data: { businessId: businessA.id, name: "Cliente de A2" },
    });
    const customerB = await prisma.customer.create({
      data: { businessId: businessB.id, name: "Cliente de B2" },
    });

    const quoteA = await prisma.quote.create({
      data: {
        businessId: businessA.id,
        customerId: customerA.id,
        number: 1,
        publicToken: `tokA_${Date.now()}`,
        currency: "ARS",
        subtotal: 1000,
        discount: 0,
        total: 1000,
      },
    });
    // Same sequential number (1) is valid for a *different* business.
    const quoteB = await prisma.quote.create({
      data: {
        businessId: businessB.id,
        customerId: customerB.id,
        number: 1,
        publicToken: `tokB_${Date.now()}`,
        currency: "ARS",
        subtotal: 2000,
        discount: 0,
        total: 2000,
      },
    });

    expect(quoteA.number).toBe(quoteB.number);

    const crossTenantLookup = await prisma.quote.findFirst({
      where: { id: quoteA.id, businessId: businessB.id },
    });
    expect(crossTenantLookup).toBeNull();
  });
});
