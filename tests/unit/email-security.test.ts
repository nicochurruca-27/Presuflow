import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { escapeHtml, safeUrl } from "@/lib/html";
import { welcomeEmail, quoteAcceptedEmail, passwordResetEmail } from "@/lib/email/templates";

const BASE = "https://presuflow.example";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const XSS = '<script>alert(1)</script>';

describe("escapeHtml", () => {
  it("escapes the five characters that matter", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("turns a script tag into text", () => {
    expect(escapeHtml(XSS)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes an attribute break-out attempt", () => {
    // The classic: close the attribute, open an event handler.
    expect(escapeHtml('" onmouseover="alert(1)')).toBe(
      "&quot; onmouseover=&quot;alert(1)"
    );
    expect(escapeHtml("' onfocus='alert(1)")).toBe("&#39; onfocus=&#39;alert(1)");
  });

  it("leaves ordinary text alone and handles empty values", () => {
    expect(escapeHtml("Ferretería López")).toBe("Ferretería López");
    expect(escapeHtml("Juan & Hnos.")).toBe("Juan &amp; Hnos.");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });

  it("escapes ampersands in one pass, without double-escaping", () => {
    expect(escapeHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });
});

describe("safeUrl", () => {
  it("passes http and https through", () => {
    expect(safeUrl("https://presuflow.example/q/abc")).toBe("https://presuflow.example/q/abc");
    expect(safeUrl("http://localhost:3000/dashboard")).toBe("http://localhost:3000/dashboard");
  });

  it("refuses protocols that execute", () => {
    // Escaping alone would not have stopped these: they contain nothing to escape.
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("JavaScript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(safeUrl("vbscript:msgbox(1)")).toBe("#");
  });

  it("refuses anything that isn't a URL", () => {
    expect(safeUrl("")).toBe("#");
    expect(safeUrl("   ")).toBe("#");
    expect(safeUrl("/relativo")).toBe("#");
    expect(safeUrl(null)).toBe("#");
  });

  it("escapes quotes so a URL can't break out of the attribute", () => {
    expect(safeUrl('https://x.test/?a="onload="alert(1)')).not.toContain('"');
  });
});

describe("email bodies never become markup", () => {
  it("escapes a name containing a script tag", () => {
    const { html } = welcomeEmail(XSS);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes an image/onerror payload in a business or customer name", () => {
    const { html } = quoteAcceptedEmail(
      '<img src=x onerror="alert(1)">',
      "Ferretería <b>López</b>",
      7,
      `${BASE}/presupuestos/abc`
    );
    expect(html).not.toContain("<img");
    // The words survive as text, which is fine; what must not survive is the
    // real attribute, with its quotes intact.
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).not.toContain("<b>López</b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes quotes, ampersands and angle brackets in the same body", () => {
    const { html } = quoteAcceptedEmail(
      `Juan & "Hermanos"`,
      "O'Brien <test>",
      1,
      `${BASE}/presupuestos/abc`
    );
    expect(html).toContain("Juan &amp; &quot;Hermanos&quot;");
    expect(html).toContain("O&#39;Brien &lt;test&gt;");
  });

  it("does not escape the subject, which is not HTML", () => {
    // Pinned on purpose: escaping here would show the reader "&amp;".
    const { subject } = quoteAcceptedEmail("Ana", `Juan & "Hermanos"`, 3, `${BASE}/x`);
    expect(subject).toBe(`Juan & "Hermanos" aceptó el presupuesto #3`);
  });

  it("neutralises a link that isn't http(s)", () => {
    const { html } = passwordResetEmail("javascript:alert(document.cookie)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });
});

describe("links are built from the configured base URL", () => {
  it("uses it for the welcome email", () => {
    expect(welcomeEmail("Ana").html).toContain(`href="${BASE}/dashboard"`);
  });

  it("uses the reset URL it was given", () => {
    const url = `${BASE}/restablecer/token123`;
    expect(passwordResetEmail(url).html).toContain(`href="${url}"`);
  });

  it("follows the environment when the base URL changes", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://otro.dominio.test");
    expect(welcomeEmail("Ana").html).toContain('href="https://otro.dominio.test/dashboard"');
  });
});
