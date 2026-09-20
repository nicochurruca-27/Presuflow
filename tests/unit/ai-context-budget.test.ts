import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { AiNotConfiguredError, AiPayloadTooLargeError } from "@/lib/ai/provider";
import { LIMITS } from "@/lib/validation/limits";

/**
 * The payload budget has to be checked before anything leaves the process,
 * otherwise it isn't protecting cost at all.
 *
 * There is no API key in the test environment, which is what makes this a
 * real assertion rather than a tautology: if the budget check were removed,
 * the call would get as far as building the client and fail with
 * AiNotConfiguredError instead. The *identity* of the error is the proof
 * that nothing was sent.
 */
describe("AI context budget", () => {
  const provider = new AnthropicProvider();

  it("refuses an over-budget payload before contacting the provider", async () => {
    const huge = "x".repeat(LIMITS.aiContextChars + 1);
    await expect(provider.improveDescription(huge)).rejects.toBeInstanceOf(AiPayloadTooLargeError);
  });

  it("applies the same ceiling to every operation", async () => {
    const huge = "x".repeat(LIMITS.aiContextChars + 1);
    await expect(provider.draftQuoteFromText(huge, "ARS")).rejects.toBeInstanceOf(
      AiPayloadTooLargeError
    );
    await expect(provider.generateConditions(huge)).rejects.toBeInstanceOf(AiPayloadTooLargeError);
    await expect(
      provider.generateFollowUpMessage({
        customerName: huge,
        businessName: "Taller",
        quoteNumber: 1,
        daysSinceSent: 3,
      })
    ).rejects.toBeInstanceOf(AiPayloadTooLargeError);
  });

  it("lets a payload within budget through to the provider", async () => {
    // It gets past the budget check and stops at the missing key, which is
    // as far as a test without credentials can go.
    await expect(provider.improveDescription("Cambio de tablero")).rejects.toBeInstanceOf(
      AiNotConfiguredError
    );
  });

  it("keeps the ceiling above what the input schemas allow", () => {
    // A prompt and a description are already bounded; the budget has to have
    // room for them plus the system prompt, or legitimate calls would fail.
    expect(LIMITS.aiContextChars).toBeGreaterThan(LIMITS.aiPrompt * 2);
    expect(LIMITS.aiContextChars).toBeGreaterThan(LIMITS.aiText * 2);
  });
});
