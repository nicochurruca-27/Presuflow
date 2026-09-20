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
seguimiento.

Sobre ese MVP se hicieron después ocho pasadas de endurecimiento: máquina de
estados y vencimiento, transiciones atómicas y concurrencia, entitlements,
aislamiento de efectos secundarios, sesiones y rate limiting, validación de
entradas y de las respuestas de la IA, escaping de emails y manejo de
secretos, y UX/responsive. Ver **Qué está probado** para el detalle de qué se
verificó y cómo.

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
  unit/                Lógica pura (totales, máquina de estados, formato de
                       moneda, parser de IA, escaping, URL base, redacción
                       de secretos, límites de entrada)
  integration/         Contra una base Postgres real (aislamiento, cuotas,
                       atomicidad, sesiones, rate limiting, emails, UX)
scripts/
  e2e-smoke.mjs        Recorre el flujo completo en un navegador real
  e2e-ux.mjs           Barrido responsive 320/375/390/768/1280 con capturas
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
  `FREE` bloquea tanto la creación de presupuestos al llegar al límite
  mensual como la de clientes al llegar a su tope (verificado con tests y
  en navegador). Ambos chequeos son server-side y corren dentro de la misma
  transacción que inserta el registro, así que no se saltan llamando a la
  Server Action directamente.

### Política de entitlements (qué plan aplica en cada momento)

El plan efectivo de un negocio lo decide `effectivePlan()`, no el campo
`plan` a secas. Esta es la política, pensada para que cuando se conecte el
billing real los webhooks solo tengan que escribir `status` y
`currentPeriodEnd`:

| Situación | Plan efectivo |
|---|---|
| Sin fila de `Subscription` | `FREE` |
| `plan = FREE` (cualquier status) | `FREE` |
| `currentPeriodEnd` ya pasó (cualquier status) | `FREE` |
| `ACTIVE`, período vigente o sin fecha | el plan contratado |
| `CANCELLED`, período vigente | el plan contratado (hasta que termine lo pagado) |
| `CANCELLED` sin `currentPeriodEnd` | `FREE` |
| `PAST_DUE`, período vigente | el plan contratado (ventana de gracia mientras se reintenta el cobro) |
| `PAST_DUE` sin `currentPeriodEnd` | `FREE` |

La regla que evita el problema de fondo: **un plan pago solo vale mientras
dure el período que se pagó**. Una fila vieja no otorga beneficios para
siempre. `cancelledAt` es informativo y no participa de la decisión.

**Qué consume cuota:**
- Presupuestos: los creados en el mes calendario que no estén borrados
  lógicamente. Cancelar un presupuesto (que setea `deletedAt`) **devuelve**
  el cupo; los `ACCEPTED`/`REJECTED`/`EXPIRED` lo conservan.
- Clientes: solo los **activos**. Archivar un cliente libera un lugar sin
  perder su historial de presupuestos.

### Otras funcionalidades

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
- **Edición de presupuestos**: se crean y no se modifican. Para corregir un
  precio hay que cancelar y crear uno nuevo.
- **Pantalla de configuración completa**: el modelo `Settings`
  (`defaultValidityDays`, `defaultConditions`, `quotePrefix`) existe pero
  ninguna pantalla lo edita todavía. Lo que sí se puede editar hoy es el
  negocio (nombre, actividad, teléfono, moneda).
- **Subida de logo**: `Business.logoUrl` se lee en la página pública del
  presupuesto, pero no hay forma de cargarlo desde la app.

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

## Vencimiento de presupuestos

El estado `EXPIRED` **funciona**, sin cron y sin job en background. La
liquidación es perezosa: cuando alguien abre un presupuesto (la página
pública, el detalle, un intento de aceptar/rechazar/seguir), `settleExpiration`
comprueba `validUntil` y aplica la transición `SENT`/`VIEWED` → `EXPIRED` de
forma atómica. Un presupuesto vencido **no puede aceptarse ni rechazarse**,
aunque nadie lo haya abierto todavía: el chequeo ocurre antes de la
transición, no después.

La consecuencia de no tener cron es que la *fila* de un presupuesto que nadie
abrió sigue diciendo `SENT`. Para que las pantallas no mientan, la capa de
lectura usa `effectiveStatus()`, una función pura que aplica la misma regla
sin escribir nada, y el filtro del listado mueve esos presupuestos a
"Vencido" dentro de la propia consulta. Hay un test que fija que las dos
implementaciones —la que escribe y la que muestra— coinciden en toda la
matriz de estados y fechas.

Un `DRAFT` vencido sigue siendo `DRAFT`: `DRAFT → EXPIRED` no es una
transición legal.

## Qué está probado (y cómo)

Todo lo siguiente se verificó contra una base PostgreSQL real corriendo
localmente (no mocks de Prisma):

**1. Tests automatizados — `npm test`, 250 tests, base `presuflow_test`.**

| Área | Qué se verifica |
|---|---|
| Máquina de estados | Cada transición documentada; ninguna salida de un estado final; ningún salto de `DRAFT` a un estado post-envío; `validUntil` respetado; `DRAFT` vencido sigue `DRAFT`; `effectiveStatus` coincide con `settleExpiration` en toda la matriz |
| Atomicidad | Dos aceptaciones simultáneas producen una sola transición, un solo evento y un solo email; aceptar y rechazar a la vez no pueden ganar los dos; dos envíos simultáneos marcan `SENT` una vez; varias cargas de la página pública registran todas las vistas pero transicionan una sola vez |
| Cuotas y numeración | La creación concurrente no supera el límite mensual de `FREE`; la numeración por negocio no se duplica |
| Multi-tenant | Un negocio no lee ni transiciona datos de otro, ni por listado ni por ID directo |
| Entitlements | 5 presupuestos/mes y 15 clientes activos en `FREE`; archivar libera lugar; cancelar devuelve cupo; `PRO` sin límite; `CANCELLED`/`PAST_DUE` respetan `currentPeriodEnd`; período vencido vuelve a `FREE`; IA gateada por plan |
| Fiabilidad | Un email o un analytics que explota no rompe ni revierte la operación crítica; el que pierde la carrera no manda notificaciones propias |
| Auth y sesiones | Reset de contraseña invalida los tokens anteriores; un usuario borrado no mantiene sesión; hasheo real; normalización de email |
| Rate limiting | Ventanas compartidas y contador atómico bajo concurrencia; ventana siguiente reinicia; IP desconocida no genera basura ni bloquea a nadie |
| Validación | Longitudes de todos los campos; cantidad/precio/descuento; fechas inválidas; máximo de ítems; desborde de las columnas de dinero; totales recalculados en el servidor ignorando lo que mande el cliente |
| IA | JSON válido, con fences, con prosa alrededor, malformado, truncado, array inesperado, campo faltante, tipo incorrecto; precio ausente **no** se convierte en 0; contexto demasiado grande se rechaza antes de llamar al proveedor |
| Emails y secretos | Escaping HTML de todo dato dinámico; `javascript:` neutralizado en links; `NEXT_PUBLIC_APP_URL` obligatoria y válida en producción; secretos y tokens enmascarados en logs; el cuerpo del email no se imprime en producción |
| UX | Estado efectivo, filtro por vencidos, seguimiento que ignora vencidos, `detail` ida y vuelta, alta de cliente inline con sus validaciones y su límite de plan |

**2. Smoke end-to-end en navegador real** — `npm run test:e2e:smoke`
(Chromium vía Playwright): registro → onboarding → cliente creado sin salir
del presupuesto → presupuesto con dos ítems → envío por WhatsApp (marca
`SENT`) → link público en otra pestaña → aceptación → el profesional la ve.
**9/9 pasos.**

**3. Verificación visual y responsive** — `node scripts/e2e-ux.mjs`: crea una
cuenta cargada a propósito con contenido hostil (nombres y descripciones en
el máximo permitido, importes de nueve cifras, un token sin espacios, varios
ítems) y recorre todas las pantallas a **320 / 375 / 390 / 768 / 1280 px**,
sacando capturas y midiendo scroll horizontal real. **51/51 checks.**

Lo que **no** está probado: los proveedores externos reales (Resend,
Anthropic con una clave válida, Stripe, Mercado Pago), porque no hay
credenciales en este entorno.

## Checklist funcional

Los flujos críticos y cómo se verifican hoy. "Auto" = cubierto por
`npm test`; "Smoke" = `npm run test:e2e:smoke`; "UX" = `scripts/e2e-ux.mjs`.

| Flujo | Cobertura |
|---|---|
| Registro | Auto + Smoke |
| Login / logout | Auto (login), manual (logout) |
| Recuperación de contraseña | Auto |
| Sesión invalidada tras el reset | Auto |
| Onboarding | Smoke + UX |
| Dashboard | UX |
| Listado y alta de clientes | Auto + UX |
| Archivar cliente | Auto |
| Crear cliente desde el presupuesto | Auto + Smoke + UX |
| Crear presupuesto | Auto + Smoke + UX |
| Enviar presupuesto | Auto + Smoke |
| Vista pública | Smoke + UX |
| Registro de visualización | Auto |
| Aceptar / rechazar | Auto + Smoke |
| Cancelar | Auto |
| Vencer | Auto + UX |
| Seguimiento | Auto |
| IA: ítems, descripción, condiciones, seguimiento | Auto (gating, límites, parser, errores) |
| IA sin `AI_API_KEY` | Auto |
| IA con respuesta inválida | Auto |
| Aislamiento multi-tenant | Auto |
| Rate limiting | Auto |
| Validaciones | Auto |
| Escaping HTML y URLs seguras | Auto |
| Secretos fuera de los logs | Auto |
| Mobile 320 / 375 / 390 | UX |

## Variables de entorno

Ver [`.env.example`](./.env.example). Resumen:

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL |
| `AUTH_SECRET` | Sí | Secreto de NextAuth (`npx auth secret`) |
| `NEXT_PUBLIC_APP_URL` | Sí (obligatoria en producción) | URL pública de la app (links en emails y WhatsApp). En producción, si falta o no es una URL http(s) válida, la app falla con un error explícito en vez de generar links a `localhost`. En desarrollo, si está vacía se usa `http://localhost:3000` |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | No | Si `AI_API_KEY` está vacío, la IA muestra un error controlado |
| `EMAIL_API_KEY`, `EMAIL_FROM` | No | Si está vacío, los emails se loguean en consola |
| `ADMIN_EMAILS` | No | Emails con acceso a `/admin`, separados por coma |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` | No | Sin uso hasta implementar el checkout (ver arriba) |
| `AUTH_TRUST_HOST` | No (solo self-hosting) | Auth.js confía automáticamente en el host cuando corre en Vercel. Si en cambio levantás `next start` en un servidor propio o en local, hace falta `AUTH_TRUST_HOST=true` o el login devuelve `UntrustedHost` |

## Instalación y desarrollo local

Requiere Node 20+, PostgreSQL 14+ y npm.

```bash
# 1. Instalar dependencias
npm install   # el repo trae .npmrc con legacy-peer-deps=true, necesario por
              # next-auth@beta + Next 16 / React 19

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

# Smoke E2E en navegador real (requiere el servidor corriendo aparte)
npm run test:e2e:smoke

# Barrido responsive + capturas (mismo requisito de servidor)
npm run test:e2e:ux
# Las capturas quedan en /tmp/presuflow-ux (configurable con UX_OUT_DIR)
```

Los dos scripts de navegador necesitan un Chromium. Si Playwright no lo
encuentra en el entorno, se le puede indicar con
`PLAYWRIGHT_CHROMIUM_PATH=/ruta/al/chrome`. Y si el servidor se levanta con
`next start` fuera de Vercel, hace falta `AUTH_TRUST_HOST=true` (ver la tabla
de variables de entorno).

## Deploy

Combinación recomendada: **Vercel** (app) + **Postgres administrado**
(Neon, Supabase o RDS) + **Resend** (email) + **Anthropic** (IA).

1. Crear el proyecto en Vercel apuntando a este repo.
2. Crear una base PostgreSQL administrada y copiar su `DATABASE_URL`.
3. Cargar en Vercel las variables de entorno de `.env.example` (como mínimo
   `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` con el dominio real).
4. Ejecutar las migraciones contra la base de producción **antes** de cada
   deploy que incluya cambios de esquema: `DATABASE_URL=<prod> npx prisma
   migrate deploy`. Vercel no las corre solo. Verificá que la cadena apunte
   a la base de producción y no a `localhost` antes de ejecutar.
5. Deploy. `next build` ya se verificó en este entorno (compila y prerrenderiza
   sin errores).
6. **No correr `npm run db:seed` contra producción** — el script se niega a
   ejecutarse si `NODE_ENV=production`, pero además no tiene sentido fuera de
   desarrollo.

> **Sobre `EMAIL_API_KEY` en producción.** Es opcional por diseño: sin ella la
> app funciona igual y ningún flujo se rompe. Pero la recuperación de
> contraseña depende de que llegue un email, así que un deploy sin esa
> variable deja a cualquiera que olvide su contraseña sin forma de
> recuperarla. En producción el cuerpo del email **no** se imprime en los
> logs (contiene el token), así que tampoco hay un plan B manual. Si vas a
> abrir el registro a usuarios reales, configurala.

## Problemas conocidos

- Las dependencias necesitan `legacy-peer-deps` porque `next-auth@5.0.0-beta`
  todavía no declara Next 16 / React 19 como peers soportados explícitamente,
  aunque funciona correctamente en la práctica (validado con build + smoke
  test). El repo trae un `.npmrc` que lo activa, así que `npm install` a secas
  alcanza — y lo mismo vale para el build en Vercel.
- El conteo de visualizaciones de un presupuesto (`QuoteView`) no distingue
  al profesional revisando su propio link de un cliente real — cualquier
  carga de la página pública cuenta. Aceptable para un MVP; una mejora de V2
  sería excluir la propia sesión del profesional.
- **Race condition conocida en el límite de clientes**: a diferencia del
  límite mensual de presupuestos, el chequeo de clientes no corre bajo el
  mismo lock, así que dos altas simultáneas podrían dejar el plan `FREE` un
  cliente por encima del tope. Deuda documentada a propósito: el costo de un
  cliente de más es despreciable frente al de tomar un lock por negocio en
  cada alta.
- El rate limiting usa **ventana fija**, no deslizante: alguien puede llegar
  a 2x el límite si se para justo sobre el borde entre dos ventanas.
- El límite de registros por IP (5/hora) podría molestar a varias personas
  detrás de un mismo NAT (coworking, red móvil con CGNAT).
- La sugerencia de mejora con IA puede devolver un texto más largo que el
  máximo del campo y en ese caso falla con un error controlado, en vez de
  recortarlo.

## Recomendaciones para V2

1. Activar un proveedor de pagos (Mercado Pago primero, por el mercado
   objetivo inicial) para poder cobrar los planes Starter/Pro.
2. Seguimiento automático por día (2/5/10), ya contemplado en el modelo de
   datos. Un cron de vencimiento **no** hace falta para que el estado sea
   correcto (ver "Vencimiento de presupuestos"), pero liquidaría en lote los
   presupuestos que nadie abre, que hoy quedan con el estado viejo en la fila.
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
