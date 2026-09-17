import { cn } from "@/lib/cn";
import { QuoteStatus } from "@prisma/client";
import { QUOTE_STATUS_COLOR, QUOTE_STATUS_LABEL } from "@/lib/quote-status";

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        QUOTE_STATUS_COLOR[status]
      )}
    >
      {QUOTE_STATUS_LABEL[status]}
    </span>
  );
}
