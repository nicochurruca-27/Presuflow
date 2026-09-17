/**
 * Development-only demo data. Never run this against a production database —
 * it exists so a new contributor (or a demo) sees a populated app immediately.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data against a production environment.");
}

const prisma = new PrismaClient();

async function main() {
  const email = "demo@presuflow.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Demo user ${email} already exists — skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const user = await prisma.user.create({
    data: { name: "Demo Martínez", email, passwordHash },
  });

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: "Electricidad Martínez",
      activity: "Electricista",
      phone: "5491122334455",
      currency: "ARS",
      quoteCounter: 3,
      settings: { create: {} },
      subscription: { create: { plan: "STARTER" } },
    },
  });

  const [juan, maria, carlos] = await Promise.all([
    prisma.customer.create({
      data: { businessId: business.id, name: "Juan Pérez", phone: "5491100000001" },
    }),
    prisma.customer.create({
      data: { businessId: business.id, name: "María González", phone: "5491100000002" },
    }),
    prisma.customer.create({
      data: { businessId: business.id, name: "Carlos Rodríguez", phone: "5491100000003" },
    }),
  ]);

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: juan.id,
      number: 1,
      publicToken: nanoid(32),
      status: "SENT",
      currency: "ARS",
      subtotal: 250000,
      discount: 0,
      total: 250000,
      sentAt: eightDaysAgo,
      items: {
        create: [
          { description: "Instalación de tablero eléctrico", quantity: 1, unitPrice: 180000, total: 180000, position: 0 },
          { description: "Materiales", quantity: 1, unitPrice: 70000, total: 70000, position: 1 },
        ],
      },
      events: { create: [{ type: "CREATED" }, { type: "SENT" }] },
    },
  });

  await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: maria.id,
      number: 2,
      publicToken: nanoid(32),
      status: "ACCEPTED",
      currency: "ARS",
      subtotal: 95000,
      discount: 5000,
      total: 90000,
      sentAt: threeDaysAgo,
      acceptedAt: new Date(),
      items: {
        create: [{ description: "Cambio de llaves térmicas", quantity: 1, unitPrice: 95000, total: 95000, position: 0 }],
      },
      events: { create: [{ type: "CREATED" }, { type: "SENT" }, { type: "VIEWED" }, { type: "ACCEPTED" }] },
    },
  });

  await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: carlos.id,
      number: 3,
      publicToken: nanoid(32),
      status: "DRAFT",
      currency: "ARS",
      subtotal: 60000,
      discount: 0,
      total: 60000,
      items: {
        create: [{ description: "Revisión de instalación", quantity: 1, unitPrice: 60000, total: 60000, position: 0 }],
      },
      events: { create: [{ type: "CREATED" }] },
    },
  });

  console.log(`Seeded demo business "Electricidad Martínez" for ${email} / demo1234`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
