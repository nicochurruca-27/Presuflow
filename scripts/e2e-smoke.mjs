/**
 * End-to-end smoke test of the core PresuFlow loop:
 * signup -> onboarding -> customer -> quote -> send -> public link -> accept.
 *
 * Requires a running dev/prod server (default http://localhost:3000) and a
 * real Chromium binary. Not wired into `npm test` because it drives a live
 * server rather than running in isolation — run it manually:
 *
 *   npm run dev            # in one terminal
 *   node scripts/e2e-smoke.mjs   # in another
 */
import { chromium } from "playwright-core";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH; // optional override

const results = [];
function log(step, ok, extra) {
  results.push({ step, ok });
  console.log(`${ok ? "OK  " : "FAIL"} - ${step}${extra ? " :: " + extra : ""}`);
}

const browser = await chromium.launch(
  CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : undefined
);
const page = await browser.newPage();
const email = `smoke_${Date.now()}@example.com`;

try {
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector("text=Crear mi primer presupuesto");
  log("Landing carga", true);

  await page.click("text=Crear mi primer presupuesto");
  await page.waitForURL("**/registro");
  await page.fill("#name", "Juan Electricista");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click('button:has-text("Crear cuenta")');
  await page.waitForURL("**/onboarding", { timeout: 10000 });
  log("Registro -> onboarding", true);

  await page.fill("#businessName", "Electricidad Martinez Smoke");
  await page.selectOption("#activity", "Electricista");
  await page.fill("#phone", "5491122334455");
  await page.click('button:has-text("Crear mi negocio")');
  await page.waitForURL("**/presupuestos/nuevo**", { timeout: 10000 });
  log("Onboarding -> nuevo presupuesto", true);

  // The inline panel is already open when the business has no customers yet.
  await page.fill('input[placeholder="Nombre del cliente"]', "Cliente de Prueba");
  await page.fill('input[placeholder="Teléfono (opcional)"]', "5491100000000");
  await page.click('button:has-text("Crear y usar")');
  // An <option> inside a closed <select> is never "visible", so wait for it
  // to be attached instead.
  await page.waitForSelector('#customerId option:has-text("Cliente de Prueba")', {
    state: "attached",
    timeout: 10000,
  });
  const selectedLabel = await page.locator("#customerId option:checked").innerText();
  log(
    "Cliente creado sin salir del presupuesto y queda seleccionado",
    selectedLabel.trim() === "Cliente de Prueba",
    selectedLabel.trim()
  );
  await page.fill('input[placeholder="Descripción del servicio"]', "Instalación de tablero eléctrico");
  await page.fill("#qty-0", "1");
  await page.fill("#price-0", "150000");
  await page.click("text=+ Agregar ítem");
  await page.locator('input[placeholder="Descripción del servicio"]').nth(1).fill("Materiales");
  await page.fill("#qty-1", "1");
  await page.fill("#price-1", "50000");

  await page.click('button:has-text("Crear presupuesto")');
  await page.waitForSelector("text=Link público", { timeout: 10000 });
  log("Presupuesto creado", true);

  const publicUrl = (await page.locator("p.break-all").innerText()).trim();
  log("Link público visible", publicUrl.includes("/q/"), publicUrl);

  await page.click("text=Enviar por WhatsApp");
  await page.waitForTimeout(1000);
  for (const p of browser.contexts()[0].pages()) {
    if (p !== page) await p.close().catch(() => {});
  }
  await page.reload();
  log("Estado pasa a Enviado", (await page.locator('span:has-text("Enviado")').count()) > 0);

  const clientPage = await browser.newPage();
  await clientPage.goto(publicUrl);
  await clientPage.waitForSelector("text=Aceptar presupuesto");
  await clientPage.click("text=Aceptar presupuesto");
  await clientPage.waitForSelector("text=Aceptaste este presupuesto", { timeout: 10000 });
  log("Cliente acepta el presupuesto", true);
  await clientPage.close();

  await page.reload();
  log("Profesional ve la aceptación", (await page.locator("text=aceptó este presupuesto").count()) > 0);
} catch (err) {
  log("EXCEPTION", false, err.message);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pasos OK`);
  process.exit(failed.length ? 1 : 0);
}
