import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  AiNotConfiguredError,
  AiPayloadTooLargeError,
  AiProvider,
  DraftQuoteResult,
} from "@/lib/ai/provider";
import { AiResponseError, parseAiJson } from "@/lib/ai/json";
import {
  draftQuoteResponseSchema,
  followUpMessageSchema,
  generatedConditionsSchema,
  improvedDescriptionSchema,
} from "@/lib/ai/schemas";
import { LIMITS } from "@/lib/validation/limits";

const MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

function getClient() {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  return new Anthropic({ apiKey });
}

/**
 * Single entry point to the provider, so the payload budget is enforced in
 * one place. Callers pass bounded fields, but the assembled prompt is what
 * actually costs money — and this also covers any future call that stitches
 * together several fields.
 */
async function askForText(system: string, user: string, maxTokens = 400): Promise<string> {
  if (system.length + user.length > LIMITS.aiContextChars) {
    // Thrown before the network call: over budget means we don't pay for it.
    throw new AiPayloadTooLargeError();
  }

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

/** Validates a plain-text reply, so an empty or oversized one fails here. */
function parseAiText(raw: string, schema: z.ZodType<string>, label: string): string {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AiResponseError(`${label}: el texto devuelto no es utilizable`);
  }
  return parsed.data;
}

export class AnthropicProvider implements AiProvider {
  async draftQuoteFromText(prompt: string, currency: string): Promise<DraftQuoteResult> {
    const system = `Sos un asistente que ayuda a profesionales de servicios (electricistas, plomeros, técnicos, pintores, contratistas) a convertir una descripción informal de un trabajo en los ítems estructurados de un presupuesto.

REGLAS ESTRICTAS:
- NUNCA inventes un precio. Si el usuario no menciona un precio para un ítem, el campo "unitPrice" debe ser null y agregá una nota en "missingInfo" pidiendo ese dato. No uses 0 para decir "no sé": 0 significa gratis.
- NUNCA inventes cantidades. Si el usuario no dice cuántas unidades, usá 1 y aclaralo en "missingInfo".
- NUNCA inventes materiales, servicios, descuentos, datos del cliente ni condiciones comerciales que el usuario no mencionó; si hace falta, dejalo en "detail" como algo genérico o vacío.
- Separá el trabajo en uno o más ítems razonables (por ejemplo: mano de obra vs. materiales, si el usuario los distingue).
- Como máximo ${LIMITS.aiMaxItems} ítems. "description" hasta ${LIMITS.itemDescription} caracteres, "detail" hasta ${LIMITS.itemDetail}.
- "quantity" y "unitPrice" son números, sin separadores de miles ni símbolos. "unitPrice" es un entero o null.
- La moneda de referencia es ${currency}, pero vos solo devolvés números, no símbolos de moneda.
- Respondé EXCLUSIVAMENTE con un objeto JSON válido con esta forma, sin texto adicional ni markdown:
{"items":[{"description":string,"detail":string,"quantity":number,"unitPrice":number|null}],"missingInfo":string[]}`;

    const raw = await askForText(system, prompt, 800);
    // Throws AiResponseError if the reply isn't valid: no fabricated
    // fallback item, because a draft nobody wrote is worse than no draft.
    return parseAiJson(raw, draftQuoteResponseSchema, "borrador de presupuesto");
  }

  async improveDescription(text: string): Promise<string> {
    const system = `Sos un asistente que mejora descripciones de servicios en presupuestos de profesionales (electricistas, plomeros, técnicos, etc). Mejorá la redacción para que suene profesional y clara, en español rioplatense, sin inventar datos técnicos ni precios que el usuario no mencionó. Máximo ${LIMITS.itemDescription} caracteres. Respondé solo con el texto mejorado, sin comillas ni explicaciones.`;
    const raw = await askForText(system, text, 200);
    return parseAiText(raw, improvedDescriptionSchema, "descripción mejorada");
  }

  async generateConditions(activity: string): Promise<string> {
    const system = `Redactá condiciones comerciales breves y profesionales (3 a 5 líneas) para presupuestos de un profesional de "${activity}". Incluí validez del presupuesto, forma de pago sugerida (a definir por el profesional) y que los precios pueden variar si cambia el alcance del trabajo. No inventes importes, plazos concretos ni descuentos. Español rioplatense, tono profesional pero cercano. Respondé solo con el texto, sin encabezados.`;
    const raw = await askForText(system, `Actividad: ${activity}`, 250);
    return parseAiText(raw, generatedConditionsSchema, "condiciones comerciales");
  }

  async generateFollowUpMessage(input: {
    customerName: string;
    businessName: string;
    quoteNumber: number;
    daysSinceSent: number;
  }): Promise<string> {
    const system = `Redactá un mensaje corto y cordial (máximo 4 líneas) de seguimiento comercial para un cliente que todavía no respondió un presupuesto. Nunca uses un tono de reclamo, presión o culpa (evitá frases como "¿por qué no aceptaste?"). No menciones importes ni ofrezcas descuentos. El objetivo es reabrir la conversación de forma amable y ofrecer ayuda. Español rioplatense, tono profesional y cercano. Respondé solo con el mensaje, listo para enviar por WhatsApp, sin comillas.`;
    const user = `Cliente: ${input.customerName}. Negocio: ${input.businessName}. Presupuesto #${input.quoteNumber}, enviado hace ${input.daysSinceSent} días.`;
    const raw = await askForText(system, user, 200);
    return parseAiText(raw, followUpMessageSchema, "mensaje de seguimiento");
  }
}
