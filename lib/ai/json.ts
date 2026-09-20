import { z } from "zod";

/**
 * Turning a language model's reply into data we can trust.
 *
 * The model is told to answer with nothing but JSON, and usually does. But
 * "usually" is not a contract: the same prompt can come back wrapped in
 * ```json fences, with a friendly sentence in front, truncated because it
 * hit the token ceiling, or shaped like something else entirely. Every one
 * of those has to end as a controlled error, never as data that merely
 * looks right.
 *
 * The rule this module exists to enforce: if the response doesn't parse and
 * validate, we say so. We never patch it up, fill in a default, or fall back
 * to a value we invented — that would put numbers in front of a customer
 * that nobody ever typed.
 */

/** A provider reply we couldn't turn into valid data. Safe to show as a generic message. */
export class AiResponseError extends Error {
  constructor(public readonly detail: string) {
    super("La respuesta de la IA no tiene el formato esperado.");
    this.name = "AiResponseError";
  }
}

/**
 * Removes a surrounding Markdown code fence, with or without a language tag.
 * Anything outside the fence goes with it, which is the common "here's your
 * JSON: ```json {...} ```" case.
 */
export function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Finds the first complete JSON object or array in a string.
 *
 * A regex can't do this correctly: `/\{[\s\S]*\}/` is greedy and swallows
 * everything up to the last brace anywhere in the text, and a lazy one stops
 * at the first nested close. This walks the string tracking depth, and
 * ignores braces that are inside a string literal, so prose on either side
 * of the JSON is skipped and an unterminated object reports as missing
 * rather than as something parseable.
 */
export function extractJsonCandidate(raw: string): string | null {
  const openers = ["{", "["];
  const start = raw.split("").findIndex((ch) => openers.includes(ch));
  if (start === -1) return null;

  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  // Ran out of input with the structure still open: truncated response.
  return null;
}

/**
 * The whole pipeline: extract, parse, validate against `schema`.
 *
 * Throws AiResponseError on anything that isn't valid data. The `detail` it
 * carries is for the server log; the message shown to a person is generic on
 * purpose, so a provider's raw output never reaches the browser.
 */
export function parseAiJson<T>(raw: string, schema: z.ZodType<T>, label: string): T {
  const text = stripCodeFences(raw ?? "");
  if (!text) throw new AiResponseError(`${label}: respuesta vacía`);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const candidate = extractJsonCandidate(text);
    if (candidate === null) {
      throw new AiResponseError(`${label}: no se encontró JSON completo en la respuesta`);
    }
    try {
      value = JSON.parse(candidate);
    } catch {
      throw new AiResponseError(`${label}: el JSON está malformado`);
    }
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("; ");
    throw new AiResponseError(`${label}: ${issues}`);
  }

  return parsed.data;
}
