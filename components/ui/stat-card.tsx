import { Card, CardBody } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  /**
   * Gives the card the full row on a phone. A formatted total is several
   * times wider than a count, and at 320px a half-width card forced
   * "$ 98.045.005" to break across two lines mid-number.
   */
  wide?: boolean;
}) {
  return (
    <Card className={wide ? "col-span-2 sm:col-span-1" : undefined}>
      <CardBody className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {/* Scales down on narrow screens: a formatted total is far wider
            than a count, and these sit two-per-row on a phone. */}
        <p className="mt-1.5 break-words text-xl font-semibold tabular-nums text-ink sm:text-2xl">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </CardBody>
    </Card>
  );
}
