export const metadata = { title: "Contacto" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Contacto</h1>
      <p className="mt-3 text-muted">
        ¿Tenés dudas, sugerencias o necesitás ayuda con tu cuenta? Escribinos.
      </p>
      <a
        href="mailto:hola@presuflow.app"
        className="mt-6 inline-block rounded-lg bg-brand px-5 py-3 font-medium text-white hover:bg-brand-dark"
      >
        hola@presuflow.app
      </a>
    </div>
  );
}
