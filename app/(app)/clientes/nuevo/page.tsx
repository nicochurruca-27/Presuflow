import { createCustomerAction } from "@/lib/actions/customers";
import { CustomerForm } from "@/components/customer-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Nuevo cliente" };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuote?: string }>;
}) {
  const { fromQuote } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <h1 className="font-semibold text-ink">Nuevo cliente</h1>
        </CardHeader>
        <CardBody>
          <CustomerForm action={createCustomerAction} redirectToQuote={fromQuote === "1"} />
        </CardBody>
      </Card>
    </div>
  );
}
