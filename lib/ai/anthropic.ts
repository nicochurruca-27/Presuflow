import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  AiNotConfiguredError,
  AiProvider,
  DraftQuoteResult,
} from "@/lib/ai/provider";

const MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

function getClient() {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  return new Anthropic({ apiKey });
}

async function askForText(system: string, user: string, maxTokens = 400): Promise<string> {
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

const draftResponseSchema = z.object({
  items: z.array(
    z.object({
      description: z.string(),
      detail: z.string().optional().default(""),
      quantity: z.number().positive().default(1),
      unitPrice: z.number().nullable(),
    })
  ),
  missingInfo: z.array(z.string()).default([]),
});

export class AnthropicProvider implements AiProvider {
  async draftQuoteFromText(prompt: string, currency: string): Promise<DraftQuoteResult> {
    const system = `Sos un asistente que ayuda a profesionales de servicios (electricistas, plomeros, técnicos, pintores, contratistas) a convertir una descripción informal de un trabajo en los ítems estructurados de un presupuesto.

REGLAS ESTRICTAS:
- NUNCA inventes un precio. Si el usuario no menciona un precio para un ítem, el campo "unitPrice" debe ser null y agregá una nota en "missingInfo" pidiendo ese dato.
- NUNCA inventes cantidades de materiales o detalles técnicos que el usuario no mencionó; si hace falta, dejalo en "detail" como algo genérico o vacío.
- Separá el trabajo en uno o más ítems razonables (por ejemplo: mano de obra vs. materiales, si el usuario los distingue).
- La moneda de referencia es ${currency}, pero vos solo devolvés números, no símbolos de moneda.
- Respondé EXCLUSIVAMENTE con un objeto JSON válido con esta forma, sin texto adicional ni markdown:
{"items":[{"description":string,"detail":string,"quantity":number,"unitPrice":number|null}],"missingInfo":string[]}`;

    const raw = await askForText(system, prompt, 800);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        items: [{ description: prompt.slice(0, 120), detail: "", quantity: 1, unitPrice: null }],
        missingInfo: ["No pudimos interpretar el precio. Completalo manualmente."],
      };
    }

    const parsed = draftResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return {
        items: [{ description: prompt.slice(0, 120), detail: "", quantity: 1, unitPrice: null }],
        missingInfo: ["No pudimos interpretar completamente el pedido. Revisá los ítems."],
      };
    }
    return parsed.data;
  }

  async improveDescription(text: string): Promise<string> {
    const system = `Sos un asistente que mejora descripciones de servicios en presupuestos de profesionales (electricistas, plomeros, técnicos, etc). Mejorá la redacción para que suene profesional y clara, en español rioplatense, sin inventar datos técnicos ni precios que el usuario no mencionó. Respondé solo con el texto mejorado, sin comillas ni explicaciones.`;
    return askForText(system, text, 200);
  }

  async generateConditions(activity: string): Promise<string> {
    const system = `Redactá condiciones comerciales breves y profesionales (3 a 5 líneas) para presupuestos de un profesional de "${activity}". Incluí validez del presupuesto, forma de pago sugerida (a definir por el profesional) y que los precios pueden variar si cambia el alcance del trabajo. Español rioplatense, tono profesional pero cercano. Respondé solo con el texto, sin encabezados.`;
    return askForText(system, `Actividad: ${activity}`, 250);
  }

  async generateFollowUpMessage(input: {
    customerName: string;
    businessName: string;
    quoteNumber: number;
    daysSinceSent: number;
  }): Promise<string> {
    const system = `Redactá un mensaje corto y cordial (máximo 4 líneas) de seguimiento comercial para un cliente que todavía no respondió un presupuesto. Nunca uses un tono de reclamo, presión o culpa (evitá frases como "¿por qué no aceptaste?"). El objetivo es reabrir la conversación de forma amable y ofrecer ayuda. Español rioplatense, tono profesional y cercano. Respondé solo con el mensaje, listo para enviar por WhatsApp, sin comillas.`;
    const user = `Cliente: ${input.customerName}. Negocio: ${input.businessName}. Presupuesto #${input.quoteNumber}, enviado hace ${input.daysSinceSent} días.`;
    return askForText(system, user, 200);
  }
}
