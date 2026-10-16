# Guía de setup — BackBaseNest (Backend)

Documentación paso a paso para levantar el proyecto desde cero en tu máquina local.

---

## 1. Requisitos previos

Instala y verifica lo siguiente antes de continuar:

| Herramienta | Versión recomendada | Comprobar |
|-------------|---------------------|-----------|
| **Node.js** | 20 LTS o superior | `node -v` |
| **npm** | 10+ | `npm -v` |
| **PostgreSQL** | 15+ (local) | Instalado en Windows + pgAdmin |
| **Git** | Cualquier reciente | `git -v` |
| **Docker Desktop** | Opcional | Solo si usas contenedor (ver sección 5B) |

> **Desarrollo local sin Docker:** sigue **[SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md)** (pgAdmin, crear base, `.env`).

---

## 2. Obtener el código

```bash
git clone <URL_DEL_REPOSITORIO>
cd BackBaseNest
```

Si ya tienes la carpeta del proyecto:

```bash
cd ruta/a/BackBaseNest
```

---

## 3. Instalar dependencias

```bash
npm install
```

Espera a que termine sin errores. Si aparecen avisos `EBADENGINE` por la versión de Node, usa Node 20 o 22 LTS.

---

## 4. Configurar variables de entorno

### 4.1 Crear el archivo `.env`

```bash
cp .env.example .env
```

### 4.2 Variables mínimas a revisar

Abre `.env` y confirma o ajusta:

```env
# Servidor
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4200

# PostgreSQL local (pgAdmin) — ver SETUP-POSTGRES-LOCAL.md
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=TU_CONTRASEÑA_DE_POSTGRES
DB_NAME=back_base_nest

# Esquema de BD — ver sección 6
TYPEORM_SYNC=true
TYPEORM_RUN_MIGRATIONS=false

# Seguridad (cambiar en producción)
JWT_SECRET=dev-only-change-before-production-min-32

# Cookies en desarrollo (HTTP)
COOKIE_SECURE=false
COOKIE_SAME_SITE=strict

# Usuario admin del seed
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=Admin123!
```

| Variable | Descripción |
|----------|-------------|
| `FRONTEND_URL` | Origen exacto del SPA (CORS). Debe coincidir con la URL del Angular. |
| `JWT_SECRET` | Clave para firmar JWT. En producción: cadena larga y aleatoria. |
| `TYPEORM_SYNC` | `true` = crea tablas al arrancar (solo desarrollo). |
| `TYPEORM_RUN_MIGRATIONS` | `true` = ejecuta migraciones al arrancar. |

---

## 5. Base de datos PostgreSQL

### Opción A — PostgreSQL local + pgAdmin (recomendado en tu PC)

**Guía completa:** [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md)

Resumen:

1. En pgAdmin, conectar un servidor (ej. **PostgreSQL 17**; clic derecho → **Connect Server**).
2. Crear base de datos: nombre **`back_base_nest`**, owner **`postgres`**.
3. En `.env`: `DB_PASSWORD` = la misma contraseña con la que entras a pgAdmin; `DB_PORT` = puerto del servidor (Properties → Connection).
4. `TYPEORM_SYNC=true` → `npm run start:dev` crea tablas y seed.

No necesitas Docker para esto.

### Opción B — Docker (opcional, para más adelante)

#### 5B.1 Iniciar Docker Desktop

Docker Desktop debe estar **abierto y en ejecución**.

#### 5B.2 Arrancar el contenedor

```bash
docker compose up -d
```

#### 5B.3 Verificar

```bash
docker compose ps
```

En `.env` con Docker suele valer:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=back_base_nest
```

#### 5B.4 Detener / reset

```bash
docker compose down
docker compose down -v   # borra datos
```

---

## 6. Crear el esquema de base de datos

Elige **una** de las dos opciones.

### Opción A — Desarrollo rápido (recomendada para empezar)

En `.env`:

```env
TYPEORM_SYNC=true
TYPEORM_RUN_MIGRATIONS=false
```

TypeORM crea o actualiza las tablas automáticamente al arrancar la API. No necesitas ejecutar migraciones manualmente.

### Opción B — Migraciones (recomendada para staging/producción)

En `.env`:

```env
TYPEORM_SYNC=false
TYPEORM_RUN_MIGRATIONS=false
```

Ejecutar migraciones manualmente:

```bash
npm run migration:run
```

Ver estado de migraciones:

```bash
npm run migration:show
```

Revertir la última migración (solo si es necesario):

```bash
npm run migration:revert
```

**Alternativa:** ejecutar migraciones al arrancar la API:

```env
TYPEORM_RUN_MIGRATIONS=true
```

> Requiere haber compilado antes (`npm run build`) porque las migraciones se leen desde `dist/`.

---

## 7. Arrancar la API

### 7.1 Modo desarrollo (hot-reload)

```bash
npm run start:dev
```

La API queda disponible en:

**http://localhost:3000**

Prefijo global de rutas: `/api`

### 7.2 Modo producción local (opcional)

```bash
npm run build
npm run start:prod
```

---

## 8. Seed automático (datos iniciales)

Al **primer arranque** con la base de datos vacía, el `SeedService` crea:

| Recurso | Contenido |
|---------|-----------|
| Roles | `ADMIN`, `USER` |
| Permisos | `users:read`, `users:manage`, `auth:me` |
| Usuario admin | Email y password de `SEED_ADMIN_*` en `.env` |

Por defecto:

| Campo | Valor |
|-------|-------|
| Email | `admin@example.com` |
| Password | `Admin123!` |

En los logs deberías ver líneas como:

```
[SeedService] Role created: ADMIN
[SeedService] Default admin user created: admin@example.com
[SeedService] Database seed completed
```

El seed **no** sobrescribe un admin que ya exista con el mismo email.

---

## 9. Verificar que todo funciona

### 9.1 Health checks

```bash
# Liveness
curl http://localhost:3000/api/health

# Readiness (incluye ping a PostgreSQL)
curl http://localhost:3000/api/health/ready
```

Respuesta esperada: `"status": "ok"`.

### 9.2 Login y sesión por cookies

**PowerShell:**

```powershell
# Login (guarda cookies)
curl.exe -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}' `
  -c cookies.txt -v

# Perfil autenticado
curl.exe http://localhost:3000/api/auth/me -b cookies.txt
```

**Git Bash / Linux / macOS:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!"}' \
  -c cookies.txt -v

curl http://localhost:3000/api/auth/me -b cookies.txt
```

Comprueba que:

- El body del login devuelve `UserResponseDto` (email, fullName, role).
- **No** hay campo `access_token` en el JSON.
- En DevTools o en `cookies.txt` existen cookies `access_token` y `refresh_token`.

### 9.3 Swagger

Abre en el navegador:

**http://localhost:3000/api/docs**

### 9.4 Listar usuarios (solo ADMIN)

```bash
curl http://localhost:3000/api/users -b cookies.txt
```

---

## 10. Tests

### Unitarios

```bash
npm run test
```

### End-to-end (requiere PostgreSQL + seed)

```bash
npm run test:e2e
```

---

## 11. Integración con el frontend Angular

1. El backend debe tener `FRONTEND_URL=http://localhost:4200` (o el puerto de tu SPA).
2. El frontend debe usar `withCredentials: true` en todas las peticiones al API.
3. Contrato completo para el equipo front: **[FRONTEND_PROMPT.md](./FRONTEND_PROMPT.md)**

---

## 12. Scripts npm de referencia

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | Desarrollo con watch |
| `npm run build` | Compilar a `dist/` |
| `npm run start:prod` | Ejecutar build compilado |
| `npm run lint` | ESLint |
| `npm run migration:run` | Aplicar migraciones |
| `npm run migration:revert` | Revertir última migración |
| `npm run migration:show` | Ver migraciones aplicadas |
| `npm run test` | Tests unitarios |
| `npm run test:e2e` | Tests e2e |

---

## 13. Setup desde cero (checklist)

Usa esta lista si quieres resetear o validar el entorno:

- [ ] Node.js 20+ instalado
- [ ] `npm install` sin errores
- [ ] `.env` creado desde `.env.example`
- [ ] `JWT_SECRET` definido
- [ ] `FRONTEND_URL` coincide con tu Angular
- [ ] PostgreSQL local conectado en pgAdmin **o** Docker `healthy`
- [ ] Base `back_base_nest` creada (pgAdmin) o contenedor Docker arriba
- [ ] `TYPEORM_SYNC=true` **o** `npm run migration:run`
- [ ] `npm run start:dev` → API en puerto 3000
- [ ] Logs muestran `Database seed completed`
- [ ] `GET /api/health/ready` → OK
- [ ] Login con `admin@example.com` / `Admin123!` → OK
- [ ] `GET /api/auth/me` con cookies → OK

---

## 14. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `ECONNREFUSED` al arrancar | PostgreSQL no corre | Iniciar servicio Windows `postgresql-x64-*` o `docker compose up -d` |
| `password authentication failed` | Contraseña en `.env` incorrecta | Usar la misma que en pgAdmin ([SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md)) |
| `open //./pipe/dockerDesktopLinuxEngine` | Docker apagado (solo si usas Docker) | Abrir Docker Desktop o usar PostgreSQL local |
| `relation "users" does not exist` | Sin tablas | `TYPEORM_SYNC=true` o `npm run migration:run` |
| Login `401 Invalid credentials` | Seed no corrió o password incorrecta | Revisar logs del seed; usar credenciales de `.env` |
| Login `429` | Rate limit o cuenta bloqueada | Esperar 1 min; o resetear `failed_login_attempts` / `locked_until` en BD |
| Cookies no llegan al API | CORS / origen | Igualar `FRONTEND_URL` al origen del navegador; front con `withCredentials: true` |
| Cookie ignorada en local | `COOKIE_SECURE=true` sin HTTPS | `COOKIE_SECURE=false` en desarrollo |
| Puerto 3000 en uso | Otra app ocupando el puerto | Cambiar `PORT` en `.env` o cerrar el proceso |
| Migraciones fallan | BD vacía vs sync previo | `docker compose down -v` y volver a crear esquema |

### Reset completo de la base de datos

```bash
docker compose down -v
docker compose up -d
# Esperar healthy, luego:
npm run start:dev
```

---

## 15. Producción (resumen)

Antes de desplegar:

1. `NODE_ENV=production`
2. `TYPEORM_SYNC=false` — solo migraciones (`npm run migration:run`)
3. `COOKIE_SECURE=true` y HTTPS
4. `JWT_SECRET` fuerte y único (nunca el de desarrollo)
5. Cambiar o eliminar credenciales del seed por defecto
6. `FRONTEND_URL` = dominio real del frontend
7. PostgreSQL gestionado (RDS, Cloud SQL, etc.) o contenedor en el servidor

---

## Documentación relacionada

| Archivo | Contenido |
|---------|-----------|
| [README.md](./README.md) | Visión general del proyecto |
| [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md) | PostgreSQL + pgAdmin sin Docker |
| [FRONTEND_PROMPT.md](./FRONTEND_PROMPT.md) | Prompt para generar el cliente Angular |
| [.env.example](./.env.example) | Plantilla de variables de entorno |
