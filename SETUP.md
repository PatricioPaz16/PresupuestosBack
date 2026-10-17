# Guía de instalación — Presupuestos de Taller (API)

Paso a paso para levantar el backend en una máquina de desarrollo.

---

## 1. Requisitos previos

| Herramienta | Versión recomendada | Comprobar |
|-------------|---------------------|-----------|
| **Node.js** | 20 LTS o superior | `node -v` |
| **npm** | 10+ | `npm -v` |
| **PostgreSQL** | 14 o superior (probado en 16) | pgAdmin o `psql --version` |
| **Docker Desktop** | Opcional | Solo si preferís la base en un contenedor (sección 5B) |

> **PostgreSQL instalado en Windows (sin Docker):** seguí
> **[SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md)** (pgAdmin, crear la base, `.env`).

La base usa las extensiones `pg_trgm` y `unaccent` (búsquedas sin acentos). Vienen con el
instalador de PostgreSQL para Windows y con la imagen de Docker; en Linux están en el
paquete `postgresql-contrib`.

---

## 2. Instalar dependencias

Desde la carpeta `PresupuestosBack`:

```bash
npm install
```

Hace falta correrlo aunque ya lo hayas hecho antes: se agregaron dependencias.

---

## 3. Variables de entorno

```bash
cp .env.example .env
```

Mínimo a revisar en `.env`:

```env
FRONTEND_URL=http://localhost:4200

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=TU_CONTRASEÑA_DE_POSTGRES
DB_NAME=back_base_nest

TYPEORM_RUN_MIGRATIONS=true

JWT_SECRET=una-cadena-larga-y-aleatoria-de-al-menos-32-caracteres
COOKIE_SECURE=false

SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=Admin123!
SEED_DEMO=true          # opcional: catálogo y clientes de ejemplo para probar
```

| Variable | Descripción |
|----------|-------------|
| `FRONTEND_URL` | Origen exacto del front (CORS). |
| `TYPEORM_RUN_MIGRATIONS` | `true` (por defecto): la API aplica las migraciones al arrancar. `false`: las corrés vos con `npm run migration:run`. |
| `SEED_ADMIN_*` | Administrador que se crea **solo** si la tabla de usuarios está vacía. |
| `SEED_DEMO` | `true`: carga datos de ejemplo en el primer taller si todavía no tiene catálogo. |
| `BODY_LIMIT` | Tamaño máximo del JSON (por defecto `1mb`; alcanza para el logo). |

`TYPEORM_SYNC` ya no existe: el esquema tiene triggers, columnas generadas y políticas de
seguridad que el sincronizado automático de TypeORM no sabe crear. Si quedó en tu `.env`,
se ignora.

---

## 4. Base de datos

### Opción A — PostgreSQL local + pgAdmin

Guía completa: [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md). En resumen: crear una
base vacía (por ejemplo `back_base_nest`) y poner su nombre, puerto y contraseña en `.env`.

### Opción B — Docker

```bash
docker compose up -d
docker compose ps        # back-base-nest-db debe figurar "healthy"
```

Con Docker, en `.env`: `DB_PASSWORD=postgres`.

---

## 5. Arrancar la API

```bash
npm run start:dev
```

En el primer arranque, el log muestra (entre otras) estas líneas:

```
Migration InitialSchema1747400000000 has been executed successfully.
Migration TalleresPresupuestos1792200000000 has been executed successfully.
Taller inicial creado: Taller Demo
Default admin user created: admin@example.com
Database seed completed
```

Y un aviso si la API se conecta como superusuario (`postgres`): en desarrollo está bien;
el aislamiento entre talleres funciona igual.

API: `http://localhost:3000/api` · Swagger: `http://localhost:3000/api/docs`.

### Si ya tenías la base de la versión anterior

No hace falta borrarla. La migración inicial reconoce las tablas creadas con el
sincronizado de TypeORM y la segunda agrega talleres y presupuestos. Los usuarios
existentes pasan a un taller llamado **Taller principal**.

### Migraciones a mano (opcional)

```bash
npm run migration:run      # aplica pendientes
npm run migration:show     # estado
npm run migration:revert   # revierte la última
```

---

## 6. Crear talleres

El primer taller lo crea el seed. Para sumar otros:

```bash
npm run taller:crear -- --nombre "Taller Norte" --email admin@tallernorte.com --password "Clave123!" --admin "Laura Gómez"
```

Si en PowerShell npm no recibe los parámetros, ejecutá el script compilado directamente:

```powershell
npm run build
node dist/scripts/crear-taller.js --nombre "Taller Norte" --email admin@tallernorte.com --password "Clave123!" --admin "Laura Gómez"
```

La contraseña tiene que cumplir la política del login (mayúscula, minúscula, número y
símbolo, 8+ caracteres). Después, ese administrador da de alta a su gente desde
*Usuarios* en la app.

---

## 7. Usuario de PostgreSQL de la API (producción)

La migración crea el rol sin login `presupuestos_app`, que es el que queda sujeto a las
políticas de Row Level Security, y se lo asigna al usuario que corre la migración. Si la
API usa otro usuario:

```sql
GRANT presupuestos_app TO usuario_api;                -- PostgreSQL 14 / 15
GRANT presupuestos_app TO usuario_api WITH SET TRUE;  -- PostgreSQL 16 o superior
```

Si el usuario que migra no tiene permiso para crear roles (`CREATEROLE`), un
administrador de la base lo crea una vez y después se migra normalmente:

```sql
CREATE ROLE presupuestos_app NOLOGIN;
GRANT presupuestos_app TO usuario_api WITH SET TRUE;  -- sin "WITH SET TRUE" en 14/15
```

---

## 8. Verificar

```bash
curl http://localhost:3000/api/health/ready
```

**PowerShell:**

```powershell
curl.exe -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}' `
  -c cookies.txt
curl.exe http://localhost:3000/api/presupuestos -b cookies.txt
```

**Git Bash / Linux / macOS:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!"}' \
  -c cookies.txt
curl http://localhost:3000/api/presupuestos -b cookies.txt
```

---

## 9. Tests

```bash
npm test                                  # unitarios
DB_NAME=presupuestos_test npm run test:e2e  # contra PostgreSQL real
```

Para los e2e conviene una base aparte (vacía): la crean y la migran solos. En PowerShell:
`$env:DB_NAME="presupuestos_test"; npm run test:e2e`.

---

## 10. Checklist desde cero

- [ ] Node.js 20+ y PostgreSQL 14+ instalados
- [ ] `npm install` sin errores
- [ ] `.env` creado desde `.env.example` (`DB_*`, `JWT_SECRET`, `FRONTEND_URL`)
- [ ] Base creada y vacía (o la de la versión anterior)
- [ ] `npm run start:dev` → migraciones aplicadas y `Database seed completed`
- [ ] `GET /api/health/ready` → OK
- [ ] Login con el admin del seed → OK
- [ ] Front (`PresupuestosFront`) con `npm install` y `npm start`

---

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `ECONNREFUSED` | PostgreSQL no corre | Iniciar el servicio `postgresql-x64-*` o `docker compose up -d` |
| `password authentication failed` | `DB_PASSWORD` incorrecta | La misma con la que entrás en pgAdmin |
| `Hay migraciones pendientes` | `TYPEORM_RUN_MIGRATIONS=false` | `npm run migration:run` |
| `extension "unaccent" is not available` | Faltan los módulos contrib | Linux: `postgresql-contrib`; Windows: reinstalar con el instalador oficial |
| `permission denied to create role` | El usuario que migra no tiene `CREATEROLE` | Ver sección 7 |
| `La API no puede asumir el rol "presupuestos_app"` | La API usa otro usuario | `GRANT` de la sección 7 |
| Login `401` | Credenciales o seed no corrió | Revisar el log del seed |
| Login `403` "desactivados" | Usuario o taller desactivado | Reactivar desde *Usuarios* o en la base (`users.is_active`, `talleres.activo`) |
| Login `429` | Rate limit o bloqueo | Esperar; en desarrollo subir `THROTTLE_LOGIN_LIMIT` |
| Cookies no llegan | CORS | `FRONTEND_URL` igual al origen del front |
| Puerto 3000 ocupado | Otro proceso | Cambiar `PORT` o cerrar el proceso |

---

## Documentación relacionada

| Archivo | Contenido |
|---------|-----------|
| [README.md](./README.md) | Visión general, endpoints, seguridad |
| [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) | Modelo de datos, decisiones, flujo |
| [docs/esquema-completo.sql](./docs/esquema-completo.sql) | Script SQL completo |
| [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md) | PostgreSQL + pgAdmin sin Docker |
