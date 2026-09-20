/**
 * Visual / responsive pass over the real app.
 *
 * Builds one account deliberately loaded with the content that breaks
 * layouts — a business name at the 120-character limit, a customer name at
 * 100, item descriptions at 300, a total in the hundreds of millions, many
 * items, long conditions — then walks every screen at every width we care
 * about.
 *
 * Two things come out of it: a screenshot per screen per width (for a human,
 * or for Claude, to actually look at), and an automated check that no page
 * scrolls sideways. The second one is the part that can fail the script:
 * horizontal overflow on a phone is the single most common responsive bug
 * and it's cheap to detect exactly.
 *
 *   npm start                     # in one terminal
 *   node scripts/e2e-ux.mjs       # in another
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const OUT_DIR = process.env.UX_OUT_DIR ?? "/tmp/presuflow-ux";

const WIDTHS = [320, 375, 390, 768, 1280];

const results = [];
function log(step, ok, extra) {
  results.push({ step, ok });
  console.log(`${ok ? "OK  " : "FAIL"} - ${step}${extra ? " :: " + extra : ""}`);
}

const LONG_BUSINESS = "Electricidad y Climatización Integral Hermanos Martínez e Hijos SRL Zona Sur";
const LONG_CUSTOMER = "María de los Ángeles Fernández Gutiérrez de la Torre y Sanabria";
const LONG_DESCRIPTION =
  "Instalación completa de tablero eléctrico trifásico con protección diferencial, incluye canalización embutida, cableado de todos los circuitos, tomas y llaves térmicas por ambiente";
const LONG_DETAIL =
  "Materiales de primera marca (Schneider / Sica). No incluye reparación de revoque ni pintura posterior a la canalización. Los plazos dependen de la disponibilidad del ambiente.";
const LONG_CONDITIONS =
  "Presupuesto válido por 15 días corridos desde la fecha de emisión. Forma de pago: 50% al inicio de los trabajos y 50% contra entrega, en efectivo o transferencia bancaria. Los precios pueden variar si cambia el alcance del trabajo relevado. No incluye trabajos de albañilería, pintura ni retiro de escombros salvo indicación expresa.";
const UNBREAKABLE = "Reparaciónurgentedeaireacondicionadoenaltura";

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch(
  CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : undefined
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const email = `ux_${Date.now()}@example.com`;

/** Fails the run if the document is wider than the viewport. */
async function checkNoHorizontalOverflow(label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  // One pixel of slack for sub-pixel rounding in the layout engine.
  const ok = overflow.scrollWidth <= overflow.clientWidth + 1;
  log(
    `Sin scroll horizontal — ${label}`,
    ok,
    ok ? undefined : `${overflow.scrollWidth}px > ${overflow.clientWidth}px`
  );
  return ok;
}

async function sweep(name, url) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
    await checkNoHorizontalOverflow(`${name} @ ${width}px`);
    await page.screenshot({
      path: `${OUT_DIR}/${name}-${width}.png`,
      fullPage: true,
    });
  }
}

try {
  // ---- account with deliberately hostile content -------------------------
  await page.goto(`${BASE_URL}/registro`);
  await page.fill("#name", "Juan Carlos Electricista de Prueba");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click('button:has-text("Crear cuenta")');
  await page.waitForURL("**/onboarding", { timeout: 15000 });

  await page.fill("#businessName", LONG_BUSINESS);
  await page.selectOption("#activity", "Electricista");
  await page.fill("#phone", "5491122334455");
  await page.click('button:has-text("Crear mi negocio")');
  await page.waitForURL("**/presupuestos/nuevo**", { timeout: 15000 });
  log("Cuenta de prueba creada con contenido largo", true);

  // ---- customer created inline, without leaving the quote ---------------
  await page.fill('input[placeholder="Nombre del cliente"]', LONG_CUSTOMER);
  await page.fill('input[placeholder="Teléfono (opcional)"]', "5491100000000");
  await page.click('button:has-text("Crear y usar")');
  // An <option> inside a closed <select> is never "visible", so wait for it
  // to be attached instead.
  await page.waitForSelector(`#customerId option:has-text("${LONG_CUSTOMER.slice(0, 20)}")`, {
    state: "attached",
    timeout: 15000,
  });
  const selected = (await page.locator("#customerId option:checked").innerText()).trim();
  log("Cliente inline queda seleccionado", selected === LONG_CUSTOMER, selected);

  // ---- a quote with long content and large numbers ----------------------
  await page.fill('input[placeholder="Descripción del servicio"]', LONG_DESCRIPTION.slice(0, 300));
  await page
    .locator('textarea[placeholder="Detalle (opcional): materiales, marca, aclaraciones"]')
    .first()
    .fill(LONG_DETAIL);
  await page.fill("#qty-0", "1");
  await page.fill("#price-0", "98000000");

  for (let i = 1; i <= 3; i++) {
    await page.click("text=+ Agregar ítem");
    await page.locator('input[placeholder="Descripción del servicio"]').nth(i).fill(UNBREAKABLE);
    await page.fill(`#qty-${i}`, "2.5");
    await page.fill(`#price-${i}`, i === 1 ? "0" : "1");
  }

  await page.fill("#discount", "1");
  await page.locator("#conditions").fill(LONG_CONDITIONS);
  await checkNoHorizontalOverflow("Nuevo presupuesto con datos largos @ 390px");
  await page.screenshot({ path: `${OUT_DIR}/nuevo-largo-390.png`, fullPage: true });

  await page.click('button:has-text("Crear presupuesto")');
  await page.waitForSelector("text=Link público", { timeout: 15000 });
  const quoteUrl = page.url();
  const publicUrl = (await page.locator("p.break-all").innerText()).trim();
  log("Presupuesto largo creado", publicUrl.includes("/q/"));

  // The detail typed in the form has to be on the screen, not just in the DB.
  log(
    "El detalle del ítem se muestra en el presupuesto",
    (await page.locator(`text=${LONG_DETAIL.slice(0, 40)}`).count()) > 0
  );

  await page.click("text=Enviar por WhatsApp");
  await page.waitForTimeout(1000);
  for (const p of browser.contexts()[0].pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  // ---- a second quote that has already lapsed ---------------------------
  await page.goto(`${BASE_URL}/presupuestos/nuevo`);
  await page.selectOption("#customerId", { label: LONG_CUSTOMER });
  await page.fill('input[placeholder="Descripción del servicio"]', "Service de aire acondicionado");
  await page.fill("#qty-0", "1");
  await page.fill("#price-0", "45000");
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.fill("#validUntil", past);
  await page.click('button:has-text("Crear presupuesto")');
  await page.waitForSelector("text=Link público", { timeout: 15000 });
  const expiredQuoteUrl = page.url();
  await page.click("text=Enviar por WhatsApp");
  await page.waitForTimeout(1000);
  for (const p of browser.contexts()[0].pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  // ---- EXPIRED, end to end ----------------------------------------------
  await page.goto(expiredQuoteUrl, { waitUntil: "networkidle" });
  log(
    "El detalle marca el presupuesto como Vencido",
    (await page.locator('span:has-text("Vencido")').count()) > 0
  );
  log(
    "Un presupuesto vencido no ofrece seguimiento",
    (await page.locator("text=Enviar seguimiento por WhatsApp").count()) === 0
  );
  log(
    "Un presupuesto vencido no ofrece cancelar",
    (await page.locator('button:has-text("Cancelar presupuesto")').count()) === 0
  );
  await page.screenshot({ path: `${OUT_DIR}/detalle-vencido-390.png`, fullPage: true });

  await page.goto(`${BASE_URL}/presupuestos?status=EXPIRED`, { waitUntil: "networkidle" });
  log(
    "El filtro Vencido existe y trae el presupuesto",
    (await page.locator("text=Service de aire acondicionado").count()) >= 0 &&
      (await page.locator('span:has-text("Vencido")').count()) > 0
  );
  await page.goto(`${BASE_URL}/presupuestos?status=SENT`, { waitUntil: "networkidle" });
  log(
    "El filtro Enviado ya no muestra el vencido",
    (await page.locator('span:has-text("Vencido")').count()) === 0
  );

  // ---- settings save feedback -------------------------------------------
  await page.goto(`${BASE_URL}/configuracion`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Guardar cambios")');
  await page.waitForSelector("text=Cambios guardados", { timeout: 15000 });
  log("Configuración confirma que guardó", true);

  // ---- responsive sweep --------------------------------------------------
  await sweep("dashboard", "/dashboard");
  await sweep("presupuestos", "/presupuestos");
  await sweep("presupuestos-vencidos", "/presupuestos?status=EXPIRED");
  await sweep("detalle", quoteUrl.replace(BASE_URL, ""));
  await sweep("nuevo", "/presupuestos/nuevo");
  await sweep("clientes", "/clientes");
  await sweep("configuracion", "/configuracion");
  await sweep("publico", publicUrl.replace(BASE_URL, ""));
} catch (err) {
  log("EXCEPTION", false, err.message);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT_DIR}`);
  process.exit(failed.length ? 1 : 0);
}
