export interface DraftedQuoteItem {
  description: string;
  detail?: string;
  quantity: number;
  /** null means the user never mentioned a price — the UI must ask, never guess. */
  unitPrice: number | null;
}

export interface DraftQuoteResult {
  items: DraftedQuoteItem[];
  /** Plain-language notes about missing info (e.g. "no mencionaste el precio de X") */
  missingInfo: string[];
}

/**
 * Abstraction over whatever LLM provider is configured. Swapping providers
 * means implementing this interface and wiring it in lib/ai/index.ts — no
 * other file in the app should import a provider SDK directly.
 */
export interface AiProvider {
  draftQuoteFromText(prompt: string, currency: string): Promise<DraftQuoteResult>;
  improveDescription(text: string): Promise<string>;
  generateConditions(activity: string): Promise<string>;
  generateFollowUpMessage(input: {
    customerName: string;
    businessName: string;
    quoteNumber: number;
    daysSinceSent: number;
  }): Promise<string>;
}

/**
 * Raised before calling the provider when the assembled payload is over
 * budget. Every individual field is already bounded, but the combined
 * context is what costs money, so it's checked once at the edge.
 */
export class AiPayloadTooLargeError extends Error {
  constructor() {
    super("El texto es demasiado largo para procesarlo con IA. Acortalo y probá de nuevo.");
    this.name = "AiPayloadTooLargeError";
  }
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("La función de IA no está configurada (falta AI_API_KEY).");
    this.name = "AiNotConfiguredError";
  }
}
