"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validation/customer";
import { requireBusiness } from "@/lib/auth-helpers";
import { performCreateCustomer } from "@/lib/customer-service";
import { CustomerLimitReachedError } from "@/lib/billing/entitlements";
import type { ActionState } from "@/lib/actions/auth";

function parseCustomerForm(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { business } = await requireBusiness();
  const parsed = parseCustomerForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  }

  let customer;
  try {
    customer = await performCreateCustomer(business.id, parsed.data);
  } catch (err) {
    if (err instanceof CustomerLimitReachedError) return { error: err.message };
    throw err;
  }

  const redirectTo = formData.get("redirectToQuote") === "1";
  revalidatePath("/clientes");
  if (redirectTo) {
    redirect(`/presupuestos/nuevo?clienteId=${customer.id}`);
  }
  redirect(`/clientes/${customer.id}`);
}

export async function updateCustomerAction(
  customerId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { business } = await requireBusiness();
  const parsed = parseCustomerForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: business.id },
  });
  if (!customer) return { error: "Cliente no encontrado" };

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${customerId}`);
  return undefined;
}

export async function archiveCustomerAction(customerId: string) {
  const { business } = await requireBusiness();
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: business.id },
  });
  if (!customer) return;

  await prisma.customer.update({
    where: { id: customer.id },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/clientes");
}
