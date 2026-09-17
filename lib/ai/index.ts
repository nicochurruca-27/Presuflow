import { AiProvider } from "@/lib/ai/provider";
import { AnthropicProvider } from "@/lib/ai/anthropic";

/**
 * Only one provider is implemented today (Anthropic), but the app never
 * imports AnthropicProvider directly outside this file — adding a second
 * provider means adding a branch here and implementing AiProvider.
 */
function createProvider(): AiProvider {
  const providerName = process.env.AI_PROVIDER ?? "anthropic";
  switch (providerName) {
    case "anthropic":
    default:
      return new AnthropicProvider();
  }
}

export const aiProvider = createProvider();
