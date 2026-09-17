import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuoteMock } from "@/components/marketing/quote-mock";
import { PricingSection } from "@/components/marketing/pricing-section";

const ACTIVITIES = [
  "Electricistas",
  "Plomeros",
  "Técnicos de aire acondicionado",
  "Pintores",
  "Instaladores",
  "Técnicos y reparadores",
  "Mantenimiento",
  "Contratistas",
  "Freelancers de servicios",
];

const STEPS = [
  {
    title: "Cargá el cliente y el trabajo",
    body: "Elegí el cliente, agregá los servicios o productos y su precio. Podés dictarlo en lenguaje natural y dejar que la IA arme los ítems.",
  },
  {
    title: "Enviálo por WhatsApp",
    body: "Un clic abre WhatsApp con el mensaje y el enlace ya listos. Tu cliente lo ve desde el celular, sin necesidad de registrarse.",
  },
  {
    title: "Hacé seguimiento sin esfuerzo",
    body: "PresuFlow te avisa qué presupuestos llevan varios días sin respuesta y te sugiere un mensaje cordial para retomar la conversación.",
  },
  {
    title: "Cerrá el trabajo",
    body: "Tu cliente acepta con un botón desde el mismo enlace. Vos ves la aceptación al instante y el estado se actualiza solo.",
  },
];

const FAQS = [
  {
    q: "¿Mi cliente necesita instalar algo o registrarse?",
    a: "No. Tu cliente recibe un enlace, lo abre en el navegador de su celular y puede ver y aceptar el presupuesto sin crear ninguna cuenta.",
  },
  {
    q: "¿Tengo que usar la IA para crear presupuestos?",
    a: "No, es opcional. Podés cargar cada ítem manualmente. La IA solo te ayuda a ir más rápido y nunca inventa un precio que vos no diste.",
  },
  {
    q: "¿Necesito la app de WhatsApp Business?",
    a: "No. PresuFlow arma el mensaje y abre WhatsApp normal con el enlace de tu presupuesto, editable antes de enviarlo.",
  },
  {
    q: "¿Puedo usar PresuFlow desde el celular?",
    a: "Sí, está pensado primero para celular. Podés crear y enviar un presupuesto entero desde ahí en menos de un minuto.",
  },
  {
    q: "¿Qué pasa si necesito más presupuestos que los del plan gratuito?",
    a: "Podés pasar a un plan pago con más presupuestos por mes, IA y personalización. Los pagos online se están habilitando — mientras tanto podés escribirnos.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 md:grid-cols-2 md:items-center md:pt-24">
        <div>
          <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl md:text-5xl">
            Creá presupuestos profesionales en segundos y dejá de perder trabajos por falta de
            seguimiento.
          </h1>
          <p className="mt-5 text-lg text-muted">
            PresuFlow te ayuda a crear, enviar y hacer seguimiento de tus presupuestos desde un
            solo lugar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/registro">
              <Button size="lg" className="w-full sm:w-auto">
                Crear mi primer presupuesto
              </Button>
            </Link>
            <a href="#como-funciona">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Ver cómo funciona
              </Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">Gratis para empezar. No requiere tarjeta.</p>
        </div>
        <QuoteMock />
      </section>

      {/* Problema */}
      <section className="border-y border-border bg-slate-50 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">
            Hacer presupuestos a mano te está costando trabajos
          </h2>
          <div className="mt-8 grid gap-6 text-left sm:grid-cols-3">
            <div>
              <p className="font-semibold text-ink">📝 Presupuestos manuales</p>
              <p className="mt-1 text-sm text-muted">
                Cada presupuesto en un papel, una nota o un chat distinto — sin un formato
                profesional ni prolijo.
              </p>
            </div>
            <div>
              <p className="font-semibold text-ink">💬 Se pierden en WhatsApp</p>
              <p className="mt-1 text-sm text-muted">
                Se mandan por chat y se mezclan con el resto de las conversaciones. Nadie los
                vuelve a mirar.
              </p>
            </div>
            <div>
              <p className="font-semibold text-ink">📉 Nadie hace seguimiento</p>
              <p className="mt-1 text-sm text-muted">
                El cliente lo iba a pensar, pasaron los días y el trabajo se lo terminó dando a
                otro profesional.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">Cómo funciona</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {i + 1}
              </div>
              <h3 className="mt-4 font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Beneficios */}
      <section className="border-y border-border bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">
            Todo lo que necesitás, nada de lo que no
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["⚡", "Rápido de verdad", "Armá un presupuesto completo en menos de un minuto, incluso desde el celular."],
              ["📱", "Pensado para el celular", "La mayoría de tu trabajo lo hacés desde ahí — PresuFlow también."],
              ["🔔", "Seguimiento sin culpa", "Te avisamos qué presupuestos necesitan un empujón y te damos el mensaje justo."],
              ["✅", "Aceptación con un clic", "Tu cliente acepta desde el celular, sin registrarse ni instalar nada."],
              ["🎨", "Se ve profesional", "Un presupuesto prolijo genera más confianza que una foto de un papel."],
              ["🤖", "IA que no inventa precios", "Te ayuda a redactar y ordenar, pero nunca pone un número que vos no diste."],
            ].map(([icon, title, body]) => (
              <div key={title} className="rounded-xl border border-border bg-surface p-6">
                <span className="text-2xl">{icon}</span>
                <h3 className="mt-3 font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">Hecho para profesionales de servicios</h2>
        <p className="mt-3 text-muted">
          Si trabajás a partir de presupuestos, PresuFlow está pensado para vos.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {ACTIVITIES.map((activity) => (
            <span
              key={activity}
              className="rounded-full bg-brand-light px-4 py-2 text-sm font-medium text-brand-dark"
            >
              {activity}
            </span>
          ))}
        </div>
      </section>

      <PricingSection />

      {/* FAQ */}
      <section className="border-t border-border bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-border bg-surface p-4">
                <summary className="cursor-pointer list-none font-medium text-ink marker:content-none">
                  {faq.q}
                </summary>
                <p className="mt-2 text-sm text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-ink py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Dejá de perder trabajos por no hacer seguimiento
          </h2>
          <p className="mt-3 text-slate-300">
            Creá tu cuenta gratis y armá tu primer presupuesto ahora mismo.
          </p>
          <Link href="/registro" className="mt-8 inline-block">
            <Button size="lg">Crear mi primer presupuesto</Button>
          </Link>
        </div>
      </section>
    </>
  );
}
