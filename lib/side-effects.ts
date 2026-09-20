import { logError } from "@/lib/log";
/**
 * Runs a best-effort side effect (transactional email, product analytics)
 * without ever letting it break the operation that triggered it.
 *
 * The critical write always happens first; everything that follows is
 * notification, not truth. `sendEmail()` and `track()` already swallow their
 * own errors, but relying on that means the guarantee lives in the callee:
 * one future edit — or a throw from a provider SDK constructor — silently
 * turns a failed email into a failed acceptance. Wrapping at the call site
 * makes "a secondary failure can't undo or mask the primary one" a property
 * of this code rather than an assumption about someone else's.
 */
export async function runSideEffect(label: string, effect: () => Promise<unknown>): Promise<void> {
  try {
    await effect();
  } catch (err) {
    logError("side-effect", err, { label, note: "operation itself was not affected" });
  }
}
