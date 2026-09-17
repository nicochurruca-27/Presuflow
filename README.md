# PresuFlow

PresuFlow es una aplicación web para que profesionales de servicios (electricistas,
plomeros, técnicos, pintores, instaladores, contratistas, freelancers) creen
presupuestos profesionales en segundos, los envíen por WhatsApp y hagan
seguimiento de los que todavía no fueron aceptados.

No es una herramienta de IA disfrazada de producto: la IA es una función opcional
que ayuda a redactar más rápido. El valor central es **crear, enviar y hacer
seguimiento de presupuestos** hasta que el cliente los acepta.

Flujo principal:

```
Registro → Onboarding → Cliente → Presupuesto → (IA opcional) → Enviar (WhatsApp)
   → Link público → Cliente ve y acepta → Profesional ve la aceptación
```

## Estado del proyecto

MVP funcional de punta a punta, verificado contra una base PostgreSQL real (no
mocks): autenticación real con contraseñas hasheadas, multi-tenant real,
presupuestos con cálculos server-side, página pública de aceptación, y
seguimiento. Ver la sección **Qué está probado** más abajo para el detalle de
qué se verificó y cómo.

## Arquitectura y stack

| Capa | Elección | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | Full-stack en un solo repo, Server Actions para mutaciones sin escribir una API aparte |
| Base de datos | PostgreSQL | Relacional, transaccional, ampliamente soportada |
| ORM | Prisma 6 | Migraciones versionadas, tipado end-to-end. (Se fijó en la serie 6, la última estable con la sintaxis clásica de `datasource`; Prisma 7 cambió a un esquema de configuración nuevo (`prisma.config.ts` + driver adapters) que todavía es reciente y menos probado en producción) |
| Autenticación | Auth.js / NextAuth v5 (Credentials + bcrypt, sesión JWT) | Librería madura y mantenida; no depende de un proveedor externo obligatorio |
| Estilos | Tailwind CSS v4 | Sistema de diseño consistente sin runtime extra |
| Validación | Zod, server-side, en cada Server Action | Una sola fuente de verdad para reglas de negocio; nunca se confía en totales calculados en el cliente |
| Emails transaccionales | Resend, con *fallback* a log en consola si no hay `EMAIL_API_KEY` | API simple; nunca bloquea un flujo si falta la credencial |
| IA | Anthropic Claude, detrás de una interfaz `AiProvider` abstracta (`lib/ai/provider.ts`) | Cambiar de proveedor implica una clase nueva, no tocar el resto de la app |
| Pagos | Mercado Pago (AR) y Stripe (internacional): modelo de datos y *stubs* documentados, sin credenciales | No se inventan integraciones falsas; el modelo `Subscription`/`Payment` ya soporta ambos proveedores |

### Por qué Server Actions y no una API REST separada

El 90% de las mutaciones (crear presupuesto, marcar como enviado, aceptar) son
"un formulario que persiste algo y actualiza una pantalla". Server Actions les
permite funcionar sin JavaScript de por medio para la mayoría de los flujos
(incluida la página pública de aceptación, que es HTML puro + `<form action>`),
lo cual es más rápido y liviano en un celular con conexión mala — que es
exactamente el contexto de uso principal del producto.

### Multi-tenant

`Business` es el tenant. Todas las consultas a `Customer`, `Quote`, etc. están
escopeadas por `businessId`, resuelto siempre desde la sesión del usuario
autenticado (`lib/auth-helpers.ts`), nunca desde un parámetro de la URL. Esto
se verificó con tests de integración reales (ver más abajo): un usuario no
puede leer ni por API ni por URL directa los datos de otro negocio.

## Estructura de carpetas

```
app/
  (marketing)/        Landing, precios, FAQ, legal — público, indexable
  (auth)/              Login, registro, recuperar/restablecer contraseña
  onboarding/          Alta del negocio (paso único post-registro)
  (app)/               Todo lo que requiere sesión + negocio creado
    dashboard/
    clientes/
    presupuestos/
    estadisticas/
    configuracion/
  q/[token]/           Página pública del presupuesto (sin auth)
  admin/               Panel interno, gateado por ADMIN_EMAILS
components/
  ui/                  Botón, input, card, badge — sistema visual base
  app-shell/           Nav, topbar, tab bar mobile
  quotes/, marketing/, auth/   Componentes específicos de cada área
lib/
  actions/             Server Actions ("use server"), una por dominio
  validation/          Esquemas Zod + cálculo de totales
  ai/                  Abstracción de IA + implementación Anthropic
  email/               Envío + templates
  billing/             Entitlements por plan + stubs de Stripe/Mercado Pago
  prisma.ts, auth-helpers.ts, analytics.ts, quote-service.ts, ...
prisma/
  schema.prisma        Modelo de datos completo
  seed.ts              Datos de demo (solo desarrollo)
tests/
  unit/                Lógica pura (cálculo de totales, estados, formato)
  integration/         Contra una base Postgres real (aislamiento, límites de plan, auth)
scripts/
  e2e-smoke.mjs        Recorre el flujo completo en un navegador real
```

## Modelo de datos

`User` (1:1) → `Business` (tenant) → `Customer`, `Quote` → `QuoteItem`,
`QuoteView`, `QuoteEvent`, `FollowUp`; y `Business` → `Settings`,
`Subscription` → `Payment`. Ver `prisma/schema.prisma` para el detalle
completo (constraints, índices, enums de estado).

Puntos de diseño relevantes:

- `Quote.number` es secuencial **por negocio** (no global), reservado
  atómicamente incrementando `Business.quoteCounter` dentro de una
  transacción — dos negocios pueden tener ambos un "presupuesto #1".
- `Quote.publicToken` es un `nanoid(32)` único, no adivinable, y es la única
  forma de acceder a `/q/[token]`. No requiere autenticación.
- Los montos se guardan como enteros (unidad entera de la moneda, sin
  decimales) para evitar errores de punto flotante; el subtotal/descuento/total
  siempre se recalculan en el servidor a partir de los ítems, nunca se confía
  en lo que mande el cliente.
- Borrado lógico (`deletedAt` / `archivedAt`) en `Quote` y `Customer`.
- `QuoteEvent` es un log de auditoría *append-only* del ciclo de vida
  (creado, enviado, visto, aceptado, rechazado, seguimiento, cancelado).

## Funcionalidades disponibles

- Registro y login reales (bcrypt + sesión JWT), recuperación de contraseña
  por email con token de un solo uso y expiración de 1 hora.
- Onboarding de un solo paso (nombre del negocio, actividad, teléfono, moneda).
- Multi-tenant real, con aislamiento verificado.
- CRUD de clientes con historial de presupuestos.
- Creación de presupuestos con múltiples ítems, descuento, condiciones,
  notas, validez y fecha estimada de trabajo. Totales calculados en vivo en
  el cliente y recalculados de forma autoritativa en el servidor.
- **Crear con IA**: a partir de una descripción informal, genera los ítems del
  presupuesto. Nunca inventa un precio: si el usuario no lo mencionó, el campo
  queda vacío y se lista en "falta completar". (Requiere `AI_API_KEY` y plan
  Starter/Pro — ver *Qué requiere configuración externa*).
- Mejora de descripciones y generación de condiciones con IA (mismo gating).
- Envío por WhatsApp: arma el link (`wa.me`) con un mensaje editable y marca
  el presupuesto como `SENT`.
- Página pública del presupuesto (sin login), con conteo de visualizaciones,
  transición automática `SENT → VIEWED`, y botones **Aceptar** / **Rechazar**.
- Notificación (email) al profesional cuando el cliente acepta.
- Seguimiento: detección automática de presupuestos sin respuesta hace 3+
  días, mensaje sugerido (con o sin IA) y registro del seguimiento enviado.
- Dashboard con KPIs (creados/enviados/vistos/aceptados/pendientes, importe
  presupuestado vs. aceptado) y sección "Requieren seguimiento".
- Estadísticas con tasa de aceptación.
- Planes (`FREE`/`STARTER`/`PRO`) con límites centralizados en
  `lib/billing/entitlements.ts` — nunca hardcodeados en cada pantalla.
  `FREE` bloquea la creación de un nuevo presupuesto al llegar al límite
  mensual (verificado con tests).
- Tracking de eventos de producto (`signup`, `quote_created`, `quote_accepted`, etc.)
- Panel de administración básico (`/admin`, gateado por `ADMIN_EMAILS`).
- Landing comercial completa, páginas legales (privacidad/términos/contacto),
  `sitemap.xml` y `robots.txt`.

## Funcionalidades no implementadas (documentado a propósito)

- **Cobro real**: no hay checkout de Stripe ni Mercado Pago. El modelo de
  datos (`Subscription`, `Payment`) y los puntos de integración están listos
  y documentados en `lib/billing/stripe.ts` y `lib/billing/mercadopago.ts`,
  pero no hay credenciales para implementarlos de verdad — implementarlos sin
  poder probarlos sería fingir que funcionan.
- **WhatsApp Business API**: se usa el enlace `wa.me` (abre WhatsApp normal).
  La arquitectura (mensaje generado server-side, canal `WHATSAPP` en
  `FollowUp`) está lista para reemplazar esto por la API oficial sin cambiar
  el resto del producto.
- **Automatización de seguimiento por día (2/5/10)**: hoy el seguimiento es
  manual (el profesional decide cuándo enviarlo, con un mensaje sugerido).
  El modelo `FollowUp` ya registra cada envío, así que agregar un cron que
  dispare seguimientos automáticos es una extensión, no una reescritura.
- **Firma digital**: fuera de alcance del MVP, como pide la especificación.
- **Vencimiento automático de presupuestos** (`EXPIRED`): el estado existe en
  el enum y en el modelo, pero nada lo setea todavía automáticamente al pasar
  `validUntil` — hoy es un job pendiente (cron o Vercel Cron) para V2.
- Confirmación visual de "cambios guardados" en el formulario de
  configuración del negocio (hoy guarda sin feedback explícito más allá de
  la ausencia de error).

## Qué requiere configuración externa para funcionar

Estas piezas están completas en código pero **no se pudieron probar en este
entorno** porque no hay credenciales disponibles. No se afirma que funcionan
— se afirma que están implementadas contra la interfaz real de cada proveedor
y listas para activarse con la variable de entorno correspondiente:

- **IA (Anthropic)**: sin `AI_API_KEY`, la función de IA muestra un error
  explícito ("La función de IA no está configurada") en vez de fallar
  silenciosamente o inventar datos. Esto sí se verificó (ver más abajo).
- **Email transaccional (Resend)**: sin `EMAIL_API_KEY`, los emails se
  imprimen en la consola del servidor en vez de enviarse. El contenido y los
  triggers (bienvenida, presupuesto aceptado, recuperación de contraseña) sí
  están probados; el envío real por Resend no.
- **Stripe / Mercado Pago**: no implementados (ver arriba).

## Qué está probado (y cómo)

Todo lo siguiente se verificó en este entorno contra una base PostgreSQL real
corriendo localmente (no una base simulada ni mocks de Prisma):

1. **Tests automatizados** (`npm test`, 24 tests, corren contra
   `presuflow_test`):
   - Cálculo de totales (subtotal, descuento con y sin clamping, redondeo).
   - `needsFollowUp` / `isFinalized` (máquina de estados del presupuesto).
   - Formato de moneda.
   - Hasheo de contraseñas (bcrypt) y validaciones Zod.
   - **Aislamiento multi-tenant**: un negocio no puede leer clientes ni
     presupuestos de otro, incluso por ID directo.
   - **Límites de plan**: `FREE` bloquea el presupuesto que excede el límite
     mensual; `PRO` no tiene límite; IA gateada correctamente por plan.
2. **Smoke test end-to-end en navegador real** (`npm run test:e2e:smoke`,
   Chromium vía Playwright): registro → onboarding → cliente → presupuesto
   con dos ítems → envío por WhatsApp (marca `SENT`) → apertura del link
   público en una pestaña separada (simulando al cliente) → aceptación →
   el profesional ve la aceptación reflejada. 9/9 pasos verificados en este
   entorno.
3. **Verificación manual adicional** (scripts ad-hoc durante el desarrollo,
   no incluidos en el repo): un segundo tenant no ve al cliente del primero
   ni en su listado ni accediendo a la URL directa (404); la función de IA
   sin `AI_API_KEY` configurada muestra el error al usuario sin romper la
   página.

Lo que **no** se probó: los proveedores externos reales (Resend, Anthropic
con una clave válida, Stripe, Mercado Pago) porque no hay credenciales en
este entorno.

## Variables de entorno

Ver [`.env.example`](./.env.example). Resumen:

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL |
| `AUTH_SECRET` | Sí | Secreto de NextAuth (`npx auth secret`) |
| `NEXT_PUBLIC_APP_URL` | Sí | URL pública de la app (links en emails y WhatsApp) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | No | Si `AI_API_KEY` está vacío, la IA muestra un error controlado |
| `EMAIL_API_KEY`, `EMAIL_FROM` | No | Si está vacío, los emails se loguean en consola |
| `ADMIN_EMAILS` | No | Emails con acceso a `/admin`, separados por coma |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` | No | Sin uso hasta implementar el checkout (ver arriba) |

## Instalación y desarrollo local

Requiere Node 20+, PostgreSQL 14+ y npm.

```bash
# 1. Instalar dependencias
npm install --legacy-peer-deps   # necesario por next-auth@beta + Next 16 / React 19

# 2. Crear la base de datos
createdb presuflow_dev

# 3. Configurar variables de entorno
cp .env.example .env
# editar .env: DATABASE_URL, AUTH_SECRET (npx auth secret)

# 4. Migrar
npm run db:migrate

# 5. (Opcional) cargar datos de demo — SOLO desarrollo
npm run db:seed
# crea el negocio "Electricidad Martínez" con usuario demo@presuflow.app / demo1234

# 6. Levantar el servidor de desarrollo
npm run dev
# http://localhost:3000
```

### Crear el primer usuario real

Andá a `/registro`, completá nombre/email/contraseña, y seguí el onboarding.
No hay ningún paso manual adicional — el flujo de alta es self-service.

### Probar el flujo completo

1. `npm run dev`
2. Registrate en `/registro` y completá el onboarding.
3. Creá un cliente y un presupuesto con al menos un ítem.
4. En el detalle del presupuesto, copiá el "link público" o usá "Enviar por
   WhatsApp".
5. Abrí el link público en una ventana de incógnito (simulando al cliente) y
   aceptá el presupuesto.
6. Volvé a la pestaña del profesional y refrescá: vas a ver el aviso de
   aceptación y el estado actualizado en el dashboard.

O, automatizado: `npm run test:e2e:smoke` con el servidor corriendo.

## Testing

```bash
# Tests unitarios + de integración (requieren una base de test)
createdb presuflow_test
cp .env.example .env.test   # y completar DATABASE_URL apuntando a presuflow_test
DATABASE_URL=<presuflow_test> npx prisma migrate deploy
npm test

# Smoke E2E en navegador real (requiere `npm run dev` corriendo aparte)
npm run test:e2e:smoke
```

## Deploy

Combinación recomendada: **Vercel** (app) + **Postgres administrado**
(Neon, Supabase o RDS) + **Resend** (email) + **Anthropic** (IA).

1. Crear el proyecto en Vercel apuntando a este repo.
2. Crear una base PostgreSQL administrada y copiar su `DATABASE_URL`.
3. Cargar en Vercel las variables de entorno de `.env.example` (como mínimo
   `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` con el dominio real).
4. Ejecutar las migraciones contra la base de producción antes del primer
   deploy: `DATABASE_URL=<prod> npx prisma migrate deploy`.
5. Deploy. `next build` ya se verificó en este entorno (compila y prerrenderiza
   sin errores).
6. **No correr `npm run db:seed` contra producción** — el script se niega a
   ejecutarse si `NODE_ENV=production`, pero además no tiene sentido fuera de
   desarrollo.

## Problemas conocidos

- `npm install` requiere `--legacy-peer-deps` porque `next-auth@5.0.0-beta`
  todavía no declara Next 16 / React 19 como peers soportados explícitamente,
  aunque funciona correctamente en la práctica (validado con build + smoke test).
- El conteo de visualizaciones de un presupuesto (`QuoteView`) no distingue
  al profesional revisando su propio link de un cliente real — cualquier
  carga de la página pública cuenta. Aceptable para un MVP; una mejora de V2
  sería excluir la propia sesión del profesional.
- No hay expiración automática (`EXPIRED`) de presupuestos vencidos — ver
  sección de funcionalidades no implementadas.
- El formulario de "Configuración del negocio" no muestra una confirmación
  explícita de guardado exitoso.

## Recomendaciones para V2

1. Activar un proveedor de pagos (Mercado Pago primero, por el mercado
   objetivo inicial) para poder cobrar los planes Starter/Pro.
2. Cron de vencimiento automático (`SENT`/`VIEWED` → `EXPIRED` al pasar
   `validUntil`) y de seguimiento automático por día (2/5/10), ambos ya
   contemplados en el modelo de datos.
3. Firma digital simple (checkbox + nombre aclaratorio) antes de una firma
   biométrica completa.
4. Migrar a WhatsApp Business API cuando el volumen lo justifique.
5. Páginas SEO por actividad (`/presupuestos-para-electricistas`, etc.),
   ya contempladas en la arquitectura de rutas de marketing.

## Decisiones tomadas sin consulta previa (documentadas, no bloqueantes)

Siguiendo el criterio de "no bloquearse por decisiones menores": Prisma 6 en
vez de 7 (estabilidad), URL pública `/q/[token]` en vez de `/quote/[token]`
(más corta para WhatsApp), sin dark mode (consistencia visual y menos
superficie de bugs para un MVP), sin `react-hook-form` (los formularios del
MVP son simples y Server Actions + `useActionState` alcanzan sin una
dependencia extra), sin biblioteca de componentes de terceros (Tailwind +
componentes propios, más control y menos peso).
