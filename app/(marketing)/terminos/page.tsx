export const metadata = { title: "Términos y condiciones" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold text-ink">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {new Date().toLocaleDateString("es-AR")}</p>

      <div className="prose prose-slate mt-8 max-w-none space-y-5 text-sm leading-relaxed text-ink">
        <h2 className="font-semibold">1. El servicio</h2>
        <p>
          PresuFlow es una herramienta de software que permite crear, enviar y hacer seguimiento de
          presupuestos comerciales. No somos parte de la relación comercial entre el profesional y
          sus clientes: el contenido, los precios y las condiciones de cada presupuesto son
          responsabilidad exclusiva del profesional que lo crea.
        </p>

        <h2 className="font-semibold">2. Cuentas</h2>
        <p>
          Sos responsable de mantener la confidencialidad de tu contraseña y de toda la actividad
          que ocurra en tu cuenta.
        </p>

        <h2 className="font-semibold">3. Uso de la función de inteligencia artificial</h2>
        <p>
          La función de creación con IA es una asistencia para redactar y organizar presupuestos.
          No garantiza la exactitud de los textos generados y nunca establece precios por su
          cuenta: los precios siempre deben ser ingresados o confirmados por el profesional. Es tu
          responsabilidad revisar cualquier contenido generado antes de enviarlo a un cliente.
        </p>

        <h2 className="font-semibold">4. Planes y pagos</h2>
        <p>
          PresuFlow ofrece un plan gratuito con límites de uso y planes pagos con funciones
          adicionales. Los términos específicos de facturación se comunicarán al momento de activar
          un plan pago.
        </p>

        <h2 className="font-semibold">5. Límites de responsabilidad</h2>
        <p>
          PresuFlow se ofrece &quot;tal cual&quot;. No garantizamos que el servicio esté libre de
          interrupciones o errores. No somos responsables por disputas comerciales entre el
          profesional y sus clientes derivadas del contenido de un presupuesto.
        </p>

        <h2 className="font-semibold">6. Cambios</h2>
        <p>Podemos actualizar estos términos. Te avisaremos ante cambios relevantes.</p>

        <p className="rounded-lg bg-slate-100 p-4 text-xs text-muted">
          Este documento es una plantilla general y no constituye asesoramiento legal. Antes de
          operar comercialmente, te recomendamos revisarlo con un abogado para adaptarlo a tu
          jurisdicción.
        </p>
      </div>
    </div>
  );
}
