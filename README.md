# BackBaseNest

API base en **NestJS 11** con autenticación por cookies HttpOnly, refresh tokens con rotación, RBAC, PostgreSQL, migraciones TypeORM, rate limiting, health checks, logging estructurado (Pino) y Swagger.

---

## Guía de arranque

**Setup paso a paso:** [SETUP.md](./SETUP.md) · **PostgreSQL local (pgAdmin, sin Docker):** [SETUP-POSTGRES-LOCAL.md](./SETUP-POSTGRES-LOCAL.md)

Resumen rápido:

### 1. Requisitos previos

| Herramienta      | Versión recomendada |
|------------------|---------------------|
| Node.js          | 20 LTS o superior   |
| npm              | 10+                 |
| Docker Desktop   | Para PostgreSQL     |

### 2. Clonar e instalar dependencias

```bash
cd BackBaseNest
npm install
```

### 3. Variables de entorno

```bash
cp .env.example .env
```

Revisa al menos:

- `JWT_SECRET` — cadena larga y aleatoria (mín. 32 caracteres en producción).
- `FRONTEND_URL` — debe coincidir **exactamente** con el origen de tu SPA (ej. `http://localhost:4200`).
- Credenciales de PostgreSQL (`DB_*`).

### 4. Levantar PostgreSQL

Abre **Docker Desktop** y ejecuta:

```bash
docker compose up -d
```

Comprueba que el contenedor está sano:

```bash
docker compose ps
```

Deberías ver `back-base-nest-db` en estado `healthy`.

### 5. Crear el esquema de base de datos

Tienes **dos opciones** (elige una):

#### Opción A — Desarrollo rápido (`TYPEORM_SYNC=true`)

En `.env`:

```env
TYPEORM_SYNC=true
TYPEORM_RUN_MIGRATIONS=false
```

TypeORM crea/actualiza las tablas al arrancar la API. Ideal para empezar en local.

#### Opción B — Migraciones (recomendado para staging/producción)

En `.env`:

```env
TYPEORM_SYNC=false
TYPEORM_RUN_MIGRATIONS=false
```

Ejecuta las migraciones manualmente:

```bash
npm run migration:run
```

O arranca con migraciones automáticas:

```env
TYPEORM_RUN_MIGRATIONS=true
```

### 6. Arrancar la API

```bash
npm run start:dev
```

La API queda en `http://localhost:3000`.

### 7. Seed automático

Al iniciar, si la base está vacía, el **SeedModule** crea:

| Recurso      | Detalle |
|--------------|---------|
| Roles        | `ADMIN`, `USER` |
| Permisos     | `users:read`, `users:manage`, `auth:me` |
| Usuario admin| Ver `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` en `.env` |

Por defecto:

- **Email:** `admin@example.com`
- **Password:** `Admin123!`

### 8. Verificar que todo funciona

```bash
# Liveness
curl http://localhost:3000/api/health

# Readiness (PostgreSQL)
curl http://localhost:3000/api/health/ready

# Login (guarda cookies en archivo)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}" \
  -c cookies.txt -v

# Perfil (usa cookies)
curl http://localhost:3000/api/auth/me -b cookies.txt
```

Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

### 9. Tests e2e (requiere PostgreSQL + seed)

```bash
npm run test:e2e
```

---

## Endpoints principales

| Método | Ruta                 | Acceso   | Descripción |
|--------|----------------------|----------|-------------|
| POST   | `/api/auth/login`    | Público  | Login; cookies `access_token` + `refresh_token` |
| POST   | `/api/auth/refresh`  | Público* | Rota refresh token (cookie en path `/api/auth`) |
| POST   | `/api/auth/logout`   | JWT      | Revoca refresh y borra cookies |
| GET    | `/api/auth/me`       | JWT      | Perfil actual |
| GET    | `/api/users`         | ADMIN    | Lista usuarios |
| GET    | `/api/health`        | Público  | Liveness |
| GET    | `/api/health/ready`  | Público  | Readiness + DB |

\* Requiere cookie `refresh_token` válida.

---

## Cookies de sesión

| Cookie           | Path        | Duración típica | Uso |
|------------------|-------------|-----------------|-----|
| `access_token`   | `/`         | 15 min          | JWT de acceso |
| `refresh_token`  | `/api/auth` | 7 días          | Rotación de sesión |

El JWT **nunca** se devuelve en el body JSON.

### Frontend (Angular / fetch)

```typescript
fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

---

## Seguridad incorporada

- Rate limit en login (`THROTTLE_LOGIN_LIMIT` / `THROTTLE_LOGIN_TTL_MS`)
- Bloqueo tras `MAX_LOGIN_ATTEMPTS` fallidos (`LOCKOUT_MINUTES`)
- Política de contraseña fuerte en `LoginDto`
- Refresh tokens hasheados (SHA-256) en BD con rotación
- `helmet`, CORS estricto, `ValidationPipe` con whitelist
- Logging JSON con `x-request-id` por petición

---

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | Desarrollo con hot-reload |
| `npm run build` | Compilar |
| `npm run start:prod` | Producción |
| `npm run migration:run` | Aplicar migraciones |
| `npm run migration:revert` | Revertir última migración |
| `npm run migration:show` | Estado de migraciones |
| `npm run test:e2e` | Tests end-to-end |

---

## Producción (checklist)

1. `NODE_ENV=production`
2. `TYPEORM_SYNC=false` — solo migraciones
3. `COOKIE_SECURE=true` + HTTPS
4. `JWT_SECRET` robusto y único
5. Cambiar credenciales del admin seed o desactivar seed
6. `docker compose` o RDS/Cloud SQL para PostgreSQL

---

## Solución de problemas

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| `ECONNREFUSED` al arrancar | PostgreSQL no corre | `docker compose up -d` |
| Cookies no se envían | CORS / `withCredentials` | Igualar `FRONTEND_URL` al origen del front |
| Cookie `secure` ignorada en local | `COOKIE_SECURE=true` sin HTTPS | `COOKIE_SECURE=false` en dev |
| Login 429 | Rate limit | Esperar 1 min o subir `THROTTLE_LOGIN_LIMIT` |
| Login 403 bloqueo | Muchos intentos fallidos | Esperar `LOCKOUT_MINUTES` o resetear `locked_until` en BD |
| Tablas no existen | Sin sync ni migraciones | `TYPEORM_SYNC=true` o `npm run migration:run` |

---

## Prompt para el frontend Angular

El contrato API + reglas de integración (cookies, interceptors, modelos, guards) están en **[FRONTEND_PROMPT.md](./FRONTEND_PROMPT.md)** para copiarlo a tu IA o equipo de frontend.

---

## Estructura del proyecto

```
src/
├── common/           # Guards, decorators, validators
├── config/           # Env, Swagger
├── database/         # TypeORM, migraciones, seed
└── modules/
    ├── auth/         # Login, refresh, logout, JWT
    ├── health/       # Probes
    └── users/        # Gestión de usuarios
```
