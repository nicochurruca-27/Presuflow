export const metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold text-ink">Política de privacidad</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {new Date().toLocaleDateString("es-AR")}</p>

      <div className="prose prose-slate mt-8 max-w-none space-y-5 text-sm leading-relaxed text-ink">
        <p>
          PresuFlow (&quot;nosotros&quot;) ofrece una herramienta para que profesionales de servicios creen,
          envíen y hagan seguimiento de presupuestos. Esta política describe qué datos recolectamos
          y cómo los usamos.
        </p>

        <h2 className="font-semibold">Datos que recolectamos</h2>
        <ul className="list-inside list-disc">
          <li>Datos de cuenta: nombre y email del profesional que se registra.</li>
          <li>Datos de negocio: nombre del negocio, actividad, teléfono, moneda y logo (opcional).</li>
          <li>Datos de clientes que el profesional carga: nombre, teléfono, email, dirección y notas.</li>
          <li>
            Datos de uso de los presupuestos enviados: fecha de visualización, cantidad de
            visualizaciones y eventos como aceptación o rechazo.
          </li>
        </ul>

        <h2 className="font-semibold">Cómo usamos los datos</h2>
        <p>
          Usamos los datos exclusivamente para operar el servicio: generar presupuestos, mostrar
          estadísticas al profesional, enviar emails transaccionales (bienvenida, notificación de
          aceptación, recuperación de cuenta) y, si el profesional habilita la función de IA, para
          generar borradores de presupuestos y mensajes.
        </p>

        <h2 className="font-semibold">Clientes que reciben un presupuesto</h2>
        <p>
          La persona que recibe un enlace de presupuesto no necesita registrarse. No le pedimos
          datos personales adicionales para ver o aceptar un presupuesto.
        </p>

        <h2 className="font-semibold">Con quién compartimos datos</h2>
        <p>
          No vendemos datos a terceros. Usamos proveedores de infraestructura para operar el
          servicio (base de datos, envío de emails y, opcionalmente, un proveedor de inteligencia
          artificial) únicamente para prestar la funcionalidad solicitada.
        </p>

        <h2 className="font-semibold">Tus derechos</h2>
        <p>
          Podés solicitarnos acceder, corregir o eliminar tus datos y los de tu negocio escribiendo
          a través de la página de <a href="/contacto" className="text-brand hover:underline">contacto</a>.
        </p>

        <p className="rounded-lg bg-slate-100 p-4 text-xs text-muted">
          Este documento es una descripción general y no reemplaza el asesoramiento de un abogado.
          Si operás en una jurisdicción con requisitos específicos de protección de datos (por
          ejemplo GDPR en la Unión Europea), te recomendamos revisar esta política con un
          profesional legal antes de operar comercialmente.
        </p>
      </div>
    </div>
  );
}
