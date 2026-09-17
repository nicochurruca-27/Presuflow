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

export class AiNotConfiguredError extends Error {
  constructor() {
    super("La función de IA no está configurada (falta AI_API_KEY).");
    this.name = "AiNotConfiguredError";
  }
}
