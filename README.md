# Presupuestos de Taller — API

API en **NestJS 11 + PostgreSQL** para armar, imprimir y enviar presupuestos de talleres
mecánicos. Pensada para el caso real del taller: muchos repuestos no están en stock y se
cotizan en la repuestera en el momento, así que cada ítem se puede cargar desde el catálogo
o escribir libre, con su costo y precio propios. Los repuestos que el taller sí tiene pueden
llevar stock: se carga lo que entra y, al aprobar un presupuesto, se descuenta solo.

Varios talleres comparten la misma instalación. Cada usuario pertenece a un taller y la
base de datos impide ver o tocar datos de otro (Row Level Security + claves foráneas
compuestas).

- Frontend: carpeta `PresupuestosFront` (Angular 21).
- Arquitectura, modelo de datos y decisiones: [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md).
- Script SQL completo (para leer o crear la base a mano): [docs/esquema-completo.sql](./docs/esquema-completo.sql).
- Guías de instalación: [SETUP.md](./SETUP.md) · [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md).
- Producción con Supabase + Render + Vercel: [SETUP.md, sección 7b](./SETUP.md#7b-producción-supabase--render--vercel).

---

## Arranque rápido

Requisitos: Node.js 20 LTS o superior y PostgreSQL 14 o superior (probado en 16).

```bash
npm install
cp .env.example .env        # completar DB_PASSWORD y JWT_SECRET
npm run start:dev
```

Al arrancar, la API:

1. Aplica las migraciones pendientes (`TYPEORM_RUN_MIGRATIONS=true`, el valor por defecto).
2. Si la base está vacía, crea el taller **Taller Demo** y su administrador
   (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, por defecto `admin@example.com` / `Admin123!`).
3. Con `SEED_DEMO=true`, carga además un catálogo de ejemplo, dos clientes y tres vehículos.

API en `http://localhost:3000/api` · Swagger en `http://localhost:3000/api/docs`.

> **Si venías usando la base anterior** (creada con `TYPEORM_SYNC=true`): no hace falta
> borrar nada. La migración inicial detecta las tablas existentes y la nueva agrega talleres
> y presupuestos. Los usuarios que ya existían quedan en un taller llamado
> **Taller principal** (el nombre se cambia desde *Configuración*). `TYPEORM_SYNC` ya no
> se usa: si quedó en tu `.env`, se ignora.

---

## Talleres y usuarios

| Qué | Cómo |
|-----|------|
| Crear un taller nuevo con su administrador | `npm run taller:crear -- --nombre "Taller Norte" --email admin@tallernorte.com --password "Clave123!" --admin "Laura Gómez"` |
| Agregar usuarios a un taller | Desde la app, *Usuarios* (solo administradores del taller) o `POST /api/users` |
| Datos del taller (encabezado del presupuesto, logo, IVA, validez, recargo) | Desde la app, *Configuración* (`PATCH /api/taller`) |

Roles dentro de cada taller:

- **ADMIN**: todo lo del operador + usuarios, configuración del taller y ajuste masivo de precios.
- **USER** (operador): presupuestos, clientes, vehículos y catálogo.

Un usuario desactivado o un taller desactivado pierden el acceso en el acto (no esperan a
que venza el token de 15 minutos).

---

## Endpoints

Todas las rutas llevan el prefijo `/api` y usan la cookie de sesión (salvo las públicas).
El detalle de cada body/respuesta está en Swagger.

| Método | Ruta | Acceso | Para qué |
|--------|------|--------|----------|
| POST | `/auth/login` | Público | Inicia sesión (cookies `access_token` + `refresh_token`) |
| POST | `/auth/refresh` | Público* | Renueva la sesión (rota el refresh token) |
| POST | `/auth/logout` | Sesión | Cierra la sesión (la revoca en el servidor) |
| GET | `/auth/me` | Sesión | Usuario actual, con su taller |
| GET | `/taller` | Sesión | Datos y valores por defecto del taller |
| PATCH | `/taller` | ADMIN | Edita datos del taller, logo, próximo número |
| GET | `/presupuestos` | Sesión | Listado con búsqueda (`q`), `estado`, paginado |
| GET | `/presupuestos/:id` | Sesión | Detalle completo (incluye datos internos) |
| GET | `/presupuestos/:id/documento` | Sesión | Versión para imprimir/enviar: **sin** costos, proveedor ni notas internas |
| GET | `/presupuestos/:id/pdf` | Sesión | El PDF del presupuesto (el mismo que recibe el cliente) |
| POST | `/presupuestos/:id/enlace` | Sesión | Link para el cliente (`<front>/p/<token>`), se crea la primera vez; dice cuándo lo abrió |
| POST | `/presupuestos` | Sesión | Crea (el número y los totales los pone la base) |
| PUT | `/presupuestos/:id` | Sesión | Reemplaza cabecera e ítems (requiere `version`) |
| PATCH | `/presupuestos/:id/estado` | Sesión | Cambia el estado (borrador / enviado / aprobado / rechazado) |
| POST | `/presupuestos/:id/duplicar` | Sesión | Copia como borrador nuevo |
| DELETE | `/presupuestos/:id` | Sesión | Elimina (solo borradores) |
| GET | `/vehiculos/buscar?q=` | Sesión | Busca por patente (exacta y parecidas, también dadas de baja) o por cliente (nombre, empresa, teléfono o documento) con todos sus vehículos. Sin `q`: últimos atendidos |
| GET / POST / PATCH | `/vehiculos`, `/vehiculos/:id` | Sesión | Alta rápida (con cliente nuevo o existente) y edición |
| POST | `/vehiculos/:id/baja`, `/vehiculos/:id/alta` | Sesión | Dar de baja / volver a dar de alta (los presupuestos quedan) |
| PATCH | `/vehiculos/:id/duenio` | Sesión | Cambio de dueño: cliente existente (`clienteId`) o nuevo (`cliente`) |
| GET | `/clientes?q=` | Sesión | Para los desplegables: por nombre, empresa, teléfono o documento, con sus patentes. Sin `q`: últimos atendidos |
| GET | `/clientes/listado` | Sesión | Pantalla Clientes: búsqueda (también por patente), `archivados`, paginado |
| GET | `/clientes/:id/ficha` | Sesión | Datos, vehículos (activos y dados de baja) y presupuestos del cliente |
| POST / PATCH | `/clientes`, `/clientes/:id` | Sesión | Alta y edición de datos |
| POST | `/clientes/:id/baja`, `/clientes/:id/alta` | Sesión | Baja del cliente y sus vehículos activos / alta de nuevo |
| GET / POST / PATCH | `/catalogo`, `/catalogo/:id` | Sesión | Repuestos y trabajos frecuentes; filtro `stock` (`controlado`, `faltante`, `sin_control`, `todos`) |
| GET | `/catalogo/stock/resumen` | Sesión | Faltantes, valor del stock al costo y precios viejos |
| POST | `/catalogo/:id/stock/ingresos` | Sesión | Ingreso de mercadería: suma stock y actualiza costo y precio |
| POST | `/catalogo/:id/stock/ajustes` | Sesión | Conteo: fija el stock real y registra la diferencia |
| GET | `/catalogo/:id/stock/movimientos` | Sesión | Historial de stock del repuesto |
| POST | `/catalogo/ajuste-precios` | ADMIN | Aumento masivo por porcentaje, con redondeo |
| GET / POST / PATCH | `/users`, `/users/:id` | ADMIN | Usuarios del propio taller |
| GET | `/publico/presupuestos/:token` | Público** | Hoja del presupuesto para el cliente (sin datos internos); registra que lo abrió |
| GET | `/publico/presupuestos/:token/pdf` | Público** | PDF para el cliente |
| GET | `/health`, `/health/ready` | Público | Liveness / readiness (con ping a la base) |

\* Requiere la cookie `refresh_token`.
\*\* Con el token del enlace (imposible de adivinar) y límite de 60 pedidos por minuto por IP.

Los importes viajan como **texto con punto decimal** (`"12345.67"`), nunca como número de
coma flotante. Errores de base de datos frecuentes (patente repetida, presupuesto editado
por otra persona, etc.) vuelven como 400/409 con un mensaje en castellano.

---

## Base de datos

- Esquema creado **solo por migraciones** (`src/database/migrations`). El DDL de talleres y
  presupuestos está en [`src/database/sql/1792200000000-talleres-presupuestos.sql`](./src/database/sql/1792200000000-talleres-presupuestos.sql).
- Subtotales, descuento, IVA y total los calcula **PostgreSQL** (columna generada +
  triggers). La API no acepta totales que vengan del navegador.
- Numeración correlativa propia de cada taller (`00001`, `00002`, …), sin huecos por
  concurrencia.
- Stock de repuestos mantenido por la base: cambia solo con movimientos (ingreso, conteo o
  presupuesto aprobado, por trigger) y cada uno queda en el historial.
- Aislamiento por taller con Row Level Security: cada operación de negocio corre en una
  transacción con `SET LOCAL ROLE presupuestos_app` y `app.taller_id`.

La migración crea el rol `presupuestos_app` y se lo asigna al usuario que la ejecuta. Si la
API se conecta con **otro** usuario de PostgreSQL, hay que darle permiso una vez:

```sql
GRANT presupuestos_app TO usuario_api;                -- PostgreSQL 14 / 15
GRANT presupuestos_app TO usuario_api WITH SET TRUE;  -- PostgreSQL 16 o superior
```

Al arrancar, la API comprueba que puede asumir ese rol y, si no, lo avisa en el log.

En **Supabase**, la migración `CerrarAccesoExterno` les quita a los roles `anon` y
`authenticated` el acceso a las tablas (Supabase las publica por su API REST) y activa RLS
en las de autenticación. En un PostgreSQL común no hace nada. Conexión: pooler con
`DB_SSL=true` (ver SETUP.md, sección 7b).

---

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | Desarrollo con recarga |
| `npm run build` / `npm run start:prod` | Compilar / ejecutar compilado |
| `npm run migration:run` | Aplicar migraciones a mano |
| `npm run migration:show` / `migration:revert` | Estado / revertir la última |
| `npm run taller:crear -- --nombre … --email … --password …` | Alta de taller con su administrador |
| `npm run lint` | ESLint (con corrección) |
| `npm test` | Tests unitarios (normalización de patentes y teléfonos) |
| `npm run test:e2e` | Tests contra PostgreSQL real (usá una base aparte: `DB_NAME=presupuestos_test`) |

---

## Seguridad incorporada

- Sesión en cookies HttpOnly; el JWT nunca viaja en el body. Cada token de acceso está
  atado a su sesión: logout, cambio de contraseña o desactivar al usuario cortan el acceso
  al instante.
- Refresh tokens hasheados (SHA-256) con rotación.
- Rate limit y bloqueo por intentos fallidos en el login (`THROTTLE_LOGIN_*`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`).
- Aislamiento entre talleres en la propia base (RLS forzado + claves foráneas compuestas).
- Control de concurrencia optimista en presupuestos: si dos personas editan el mismo, la
  segunda recibe un 409 en lugar de pisar los cambios.
- `helmet`, CORS estricto, `ValidationPipe` con whitelist, logs JSON con `x-request-id`.

---

## Producción (checklist)

1. `NODE_ENV=production`, `COOKIE_SECURE=true` y HTTPS. Detrás de Render/Vercel, `TRUST_PROXY=true`.
2. `JWT_SECRET` largo, aleatorio y único.
3. `FRONTEND_URL` igual al dominio real del front.
4. Usuario de PostgreSQL **sin** superusuario para la API (ver permiso del rol arriba).
5. `SEED_ADMIN_PASSWORD` propia (no la del ejemplo) y `SEED_DEMO=false`.
6. Backups automáticos de la base.

---

## Problemas frecuentes

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| `ECONNREFUSED` al arrancar | PostgreSQL no corre | Iniciar el servicio o `docker compose up -d` |
| `Hay migraciones pendientes` en el log | Se arrancó con `TYPEORM_RUN_MIGRATIONS=false` | `npm run migration:run` |
| `La API no puede asumir el rol "presupuestos_app"` | La API usa un usuario distinto del que corrió las migraciones | `GRANT presupuestos_app TO <usuario>` (ver arriba) |
| `permission denied to create role` al migrar | El usuario de la migración no tiene `CREATEROLE` | Correr una vez como `postgres`: `CREATE ROLE presupuestos_app NOLOGIN;` y el `GRANT`, y volver a migrar |
| `extension "unaccent" is not available` | PostgreSQL sin los módulos *contrib* | En Linux: instalar `postgresql-contrib`; el instalador de Windows ya los trae |
| Cookies no se envían | CORS / origen distinto | Igualar `FRONTEND_URL` al origen del front |
| Login 429 | Rate limit | Esperar 1 minuto o subir `THROTTLE_LOGIN_LIMIT` en desarrollo |
| 409 "Otra persona guardó este presupuesto…" | Dos pestañas o usuarios editando lo mismo | Recargar el presupuesto y repetir el cambio |

---

## Estructura

```
src/
├── common/
│   ├── database/        # TenantService (rol + taller por transacción), tipos de pg
│   ├── filters/         # Errores de PostgreSQL -> respuestas HTTP en castellano
│   ├── normalizers/     # Patentes argentinas y teléfonos (E.164) + tests
│   └── …                # Guards, decorators (@TallerId, @Roles, @Public)
├── config/              # Variables de entorno, Swagger
├── database/
│   ├── migrations/      # InitialSchema + TalleresPresupuestos
│   ├── sql/             # DDL completo de talleres y presupuestos
│   └── seed/            # Roles, taller inicial, admin, datos de ejemplo
├── modules/
│   ├── auth/            # Login, refresh, logout, sesión
│   ├── users/           # Usuarios del taller
│   ├── talleres/        # Configuración del taller
│   ├── clientes/        # Listado, ficha, alta/baja
│   ├── vehiculos/       # Búsqueda, alta rápida, alta/baja y cambio de dueño
│   ├── catalogo/        # Repuestos y trabajos frecuentes, stock e historial
│   ├── presupuestos/    # Alta, edición, estados, documento, PDF y enlace público
│   └── health/
└── scripts/crear-taller.ts
```
