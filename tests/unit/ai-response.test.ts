import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AiResponseError,
  extractJsonCandidate,
  parseAiJson,
  stripCodeFences,
} from "@/lib/ai/json";
import {
  draftQuoteResponseSchema,
  followUpMessageSchema,
  improvedDescriptionSchema,
} from "@/lib/ai/schemas";
import { LIMITS } from "@/lib/validation/limits";

const label = "borrador";

function parseDraft(raw: string) {
  return parseAiJson(raw, draftQuoteResponseSchema, label);
}

function draftJson(items: unknown, missingInfo: unknown = []) {
  return JSON.stringify({ items, missingInfo });
}

const goodItem = { description: "Instalación de tablero", detail: "", quantity: 1, unitPrice: 50000 };

describe("extracting JSON from a model reply", () => {
  it("parses a clean response", () => {
    const result = parseDraft(draftJson([goodItem], ["Falta el precio del cable"]));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(50000);
    expect(result.missingInfo).toEqual(["Falta el precio del cable"]);
  });

  it("parses a response wrapped in a markdown fence", () => {
    const fenced = "```json\n" + draftJson([goodItem]) + "\n```";
    expect(parseDraft(fenced).items[0].description).toBe("Instalación de tablero");

    const bare = "```\n" + draftJson([goodItem]) + "\n```";
    expect(parseDraft(bare).items).toHaveLength(1);
  });

  it("parses a response with prose before and after it", () => {
    const chatty = `¡Claro! Acá va el presupuesto:\n${draftJson([goodItem])}\nAvisame si querés ajustarlo.`;
    expect(parseDraft(chatty).items).toHaveLength(1);
  });

  it("is not fooled by braces inside a string", () => {
    const tricky = draftJson([{ ...goodItem, description: "Tablero {principal} y llaves" }]);
    expect(parseDraft(`texto ${tricky} más texto`).items[0].description).toBe(
      "Tablero {principal} y llaves"
    );
  });

  it("finds the object even when the prose contains a stray brace", () => {
    const raw = `nota: usá { llaves } con cuidado\n${draftJson([goodItem])}`;
    // The stray "{ llaves }" parses as a candidate but fails the schema, and
    // a wrong answer must not come back as data.
    expect(() => parseAiJson(raw, draftQuoteResponseSchema, label)).toThrow(AiResponseError);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseDraft('{"items": [ {"description": "x",, } ]}')).toThrow(AiResponseError);
  });

  it("rejects a truncated response instead of salvaging part of it", () => {
    const cut = draftJson([goodItem]).slice(0, 40);
    expect(() => parseDraft(cut)).toThrow(AiResponseError);
  });

  it("rejects an empty response", () => {
    expect(() => parseDraft("")).toThrow(AiResponseError);
    expect(() => parseDraft("   \n  ")).toThrow(AiResponseError);
  });

  it("rejects an array where an object was expected", () => {
    expect(() => parseDraft(JSON.stringify([goodItem]))).toThrow(AiResponseError);
  });

  it("rejects null", () => {
    expect(() => parseDraft("null")).toThrow(AiResponseError);
  });

  it("scans for balanced structures rather than greedily", () => {
    expect(extractJsonCandidate('ruido {"a":1} más {"b":2}')).toBe('{"a":1}');
    expect(extractJsonCandidate('{"a":{"b":1}} sobra')).toBe('{"a":{"b":1}}');
    expect(extractJsonCandidate('{"a":"}"}')).toBe('{"a":"}"}');
    expect(extractJsonCandidate('{"a":"\\""}')).toBe('{"a":"\\""}');
    expect(extractJsonCandidate('{"a":1')).toBeNull();
    expect(extractJsonCandidate("sin json")).toBeNull();
  });

  it("strips fences without touching unfenced text", () => {
    expect(stripCodeFences("```json\n{}\n```")).toBe("{}");
    expect(stripCodeFences("{}")).toBe("{}");
  });

  it("keeps the provider's raw text out of the thrown message", () => {
    try {
      parseDraft("lo siento, no puedo ayudarte con eso");
      throw new Error("debería haber fallado");
    } catch (err) {
      expect(err).toBeInstanceOf(AiResponseError);
      expect((err as AiResponseError).message).not.toContain("lo siento");
      // The detail is for the server log, and it names what went wrong.
      expect((err as AiResponseError).detail).toContain(label);
    }
  });
});

describe("the AI cannot invent data", () => {
  it("refuses a response with no price field instead of defaulting it to zero", () => {
    const noPrice = draftJson([{ description: "Mano de obra", detail: "", quantity: 1 }]);
    expect(() => parseDraft(noPrice)).toThrow(AiResponseError);
  });

  it("keeps an unknown price as null so the user has to fill it in", () => {
    const result = parseDraft(
      draftJson([{ ...goodItem, unitPrice: null }], ["No mencionaste el precio de la mano de obra"])
    );
    expect(result.items[0].unitPrice).toBeNull();
    expect(result.missingInfo).toHaveLength(1);
  });

  it("refuses a price sent as a string, rather than coercing it", () => {
    // "" or "no sé" would coerce to 0 — a price nobody quoted.
    expect(() => parseDraft(draftJson([{ ...goodItem, unitPrice: "50000" }]))).toThrow(
      AiResponseError
    );
    expect(() => parseDraft(draftJson([{ ...goodItem, unitPrice: "" }]))).toThrow(AiResponseError);
  });

  it("refuses an invented negative or absurd price", () => {
    expect(() => parseDraft(draftJson([{ ...goodItem, unitPrice: -100 }]))).toThrow(AiResponseError);
    expect(() =>
      parseDraft(draftJson([{ ...goodItem, unitPrice: LIMITS.maxUnitPrice + 1 }]))
    ).toThrow(AiResponseError);
    // A fractional price can't be stored in the Int column either.
    expect(() => parseDraft(draftJson([{ ...goodItem, unitPrice: 1500.75 }]))).toThrow(
      AiResponseError
    );
  });

  it("refuses a missing or invented quantity", () => {
    const noQuantity = draftJson([{ description: "Mano de obra", detail: "", unitPrice: 1000 }]);
    expect(() => parseDraft(noQuantity)).toThrow(AiResponseError);

    expect(() => parseDraft(draftJson([{ ...goodItem, quantity: 0 }]))).toThrow(AiResponseError);
    expect(() => parseDraft(draftJson([{ ...goodItem, quantity: -2 }]))).toThrow(AiResponseError);
    expect(() =>
      parseDraft(draftJson([{ ...goodItem, quantity: LIMITS.maxQuantity + 1 }]))
    ).toThrow(AiResponseError);
  });

  it("refuses an empty item list and an oversized one", () => {
    expect(() => parseDraft(draftJson([]))).toThrow(AiResponseError);

    const many = Array.from({ length: LIMITS.aiMaxItems + 1 }, () => goodItem);
    expect(() => parseDraft(draftJson(many))).toThrow(AiResponseError);
  });

  it("refuses text longer than the field it would land in", () => {
    const longDescription = "x".repeat(LIMITS.itemDescription + 1);
    expect(() => parseDraft(draftJson([{ ...goodItem, description: longDescription }]))).toThrow(
      AiResponseError
    );
  });

  it("drops fields we never asked for", () => {
    const result = parseDraft(
      draftJson([{ ...goodItem, discount: 500, customerEmail: "robado@test.com" }])
    );
    expect(result.items[0]).not.toHaveProperty("discount");
    expect(result.items[0]).not.toHaveProperty("customerEmail");
  });

  it("treats an absent detail or missingInfo as empty, which invents nothing", () => {
    const result = parseAiJson(
      JSON.stringify({ items: [{ description: "Mano de obra", quantity: 1, unitPrice: 1000 }] }),
      draftQuoteResponseSchema,
      label
    );
    expect(result.items[0].detail).toBe("");
    expect(result.missingInfo).toEqual([]);
  });
});

describe("plain-text AI replies", () => {
  it("rejects an empty reply and one longer than the target field", () => {
    expect(improvedDescriptionSchema.safeParse("").success).toBe(false);
    expect(improvedDescriptionSchema.safeParse("   ").success).toBe(false);
    expect(
      improvedDescriptionSchema.safeParse("x".repeat(LIMITS.itemDescription + 1)).success
    ).toBe(false);
    expect(improvedDescriptionSchema.safeParse("Instalación de tablero trifásico").success).toBe(
      true
    );
  });

  it("bounds a follow-up message to what the column holds", () => {
    expect(followUpMessageSchema.safeParse("x".repeat(LIMITS.followUpMessage + 1)).success).toBe(
      false
    );
    expect(followUpMessageSchema.safeParse("Hola Ana, ¿pudiste verlo?").success).toBe(true);
  });
});

describe("parseAiJson with any schema", () => {
  it("returns typed data and rejects the wrong shape", () => {
    const schema = z.object({ ok: z.boolean() });
    expect(parseAiJson('{"ok":true}', schema, "prueba")).toEqual({ ok: true });
    expect(() => parseAiJson('{"ok":"true"}', schema, "prueba")).toThrow(AiResponseError);
  });
});
