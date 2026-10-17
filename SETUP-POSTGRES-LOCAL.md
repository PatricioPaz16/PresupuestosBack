# PostgreSQL local con pgAdmin (sin Docker)

Guía para usar tu instalación de PostgreSQL en Windows con pgAdmin, sin `docker compose`.

---

## 1. Elegir un solo servidor PostgreSQL

En pgAdmin ves varios servidores (por ejemplo **PostgreSQL 15**, **17**, **18**). Cada uno es una instalación distinta.

| Recomendación | Detalle |
|---------------|---------|
| Usa **uno solo** | Elige la versión que uses habitualmente (ej. **PostgreSQL 17**). |
| No mezcles | El proyecto solo necesita conectarse a **un** puerto. |
| Icono rojo (X) | Significa que **no estás conectado** todavía, no que esté roto. |

> Si tienes varias versiones instaladas, cada una suele usar un **puerto distinto** (5432, 5433, 5434…). Debes usar el puerto del servidor al que te conectes.

---

## 2. Conectar el servidor en pgAdmin

1. Abre **pgAdmin**.
2. En el panel izquierdo (**Object Explorer**), expande **Servers**.
3. Clic derecho en el servidor que quieras usar (ej. **PostgreSQL 17**) → **Connect Server…**
4. Te pedirá la contraseña del usuario **`postgres`** (la definiste al instalar PostgreSQL en Windows).
5. Si conecta bien, el icono deja de mostrar la X roja y verás **Databases**, **Login/Group Roles**, etc.

### Si no recuerdas la contraseña

- Es la que pusiste en el instalador de PostgreSQL (EnterpriseDB).
- O la que configuraste después en pgAdmin → servidor → **Properties** → pestaña **Connection**.

### Ver el puerto del servidor

1. Clic derecho en el servidor → **Properties**.
2. Pestaña **Connection**.
3. Anota **Port** (casi siempre `5432` si solo tienes una instalación activa).

---

## 3. Crear la base de datos del proyecto

1. Con el servidor conectado, expande **Databases**.
2. Clic derecho en **Databases** → **Create** → **Database…**
3. Completa:

| Campo | Valor |
|-------|--------|
| **Database** | `back_base_nest` |
| **Owner** | `postgres` (por defecto) |

4. Pestaña **Definition** (opcional): encoding `UTF8`.
5. **Save**.

Ya tienes la base vacía lista para el backend.

### Extensiones

Las migraciones crean solas las extensiones que usa el proyecto (`uuid-ossp`, `pg_trgm`
para búsquedas rápidas y `unaccent` para que "bujia" encuentre "Bujía"). Vienen incluidas
en el instalador de PostgreSQL para Windows; no hay que instalar nada aparte.

---

## 4. Configurar el `.env` del backend

En la raíz del proyecto (`PresupuestosBack`), edita `.env` (si no existe, copialo de `.env.example`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=TU_CONTRASEÑA_DE_POSTGRES
DB_NAME=back_base_nest

TYPEORM_RUN_MIGRATIONS=true
```

| Variable | Qué poner |
|----------|-----------|
| `DB_HOST` | `localhost` |
| `DB_PORT` | El puerto de la pestaña **Connection** de pgAdmin (ej. `5432` o `5433`) |
| `DB_USERNAME` | `postgres` (usuario por defecto) |
| `DB_PASSWORD` | La misma contraseña con la que conectaste en pgAdmin |
| `DB_NAME` | `back_base_nest` (nombre exacto de la base creada) |

**No uses** `DB_PASSWORD=postgres` a menos que esa sea realmente tu contraseña local.

---

## 5. Comprobar la conexión desde pgAdmin

1. Clic derecho en la base **`back_base_nest`** → **Query Tool**.
2. Ejecuta:

```sql
SELECT current_database(), current_user;
```

Debe devolver `back_base_nest` y `postgres`.

---

## 6. Arrancar el backend (crea tablas + seed)

Desde la carpeta del proyecto:

```bash
npm install
npm run start:dev
```

Al arrancar:

- Las **migraciones** crean las tablas en `back_base_nest` (o completan las que faltan si
  la base ya tenía las de la versión anterior).
- El **seed** inserta roles, permisos, el taller **Taller Demo** y el usuario admin (solo
  si todavía no hay usuarios).

En pgAdmin, refrescá la base (**Refresh**): deberías ver `talleres`, `users`, `clientes`,
`vehiculos`, `catalogo_items`, `presupuestos`, `presupuesto_items`, `numeradores`, además de
`roles`, `permissions`, `refresh_tokens` y `typeorm_migrations`.

> Las tablas de negocio tienen **Row Level Security**: si las consultás desde pgAdmin con
> el usuario `postgres` las vas a ver completas (el superusuario no queda limitado), pero
> la API siempre filtra por el taller del usuario conectado.

### Usuario admin por defecto

| Email | Password |
|-------|----------|
| `admin@example.com` | `Admin123!` |

---

## 7. Verificar desde el navegador o curl

- Health: http://localhost:3000/api/health/ready  
- Swagger: http://localhost:3000/api/docs  

Login de prueba (PowerShell):

```powershell
curl.exe -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}' `
  -c cookies.txt
```

---

## 8. Varios PostgreSQL instalados (15, 17, 18)

Si **solo uno** puede estar en el puerto 5432:

- Conecta en pgAdmin al que esté activo y usa ese puerto en `.env`.

Si **cada versión usa otro puerto**:

| Servidor pgAdmin | Puerto típico |
|------------------|---------------|
| PostgreSQL 15 | 5433 |
| PostgreSQL 17 | 5432 |
| PostgreSQL 18 | 5434 |

> Los puertos reales los ves en **Properties → Connection** de cada servidor. No asumas: **copia el puerto de pgAdmin al `.env`**.

Solo una instancia debe coincidir con `DB_PORT` en `.env`.

---

## 9. Problemas frecuentes

| Error | Causa | Solución |
|-------|--------|----------|
| `password authentication failed` | `DB_PASSWORD` incorrecta en `.env` | Usar la misma contraseña que en pgAdmin al conectar |
| `ECONNREFUSED` | PostgreSQL no está corriendo | Iniciar servicio Windows: *Services* → `postgresql-x64-17` → Start |
| `database "back_base_nest" does not exist` | Base no creada | Crear base en pgAdmin (paso 3) |
| `connect ECONNREFUSED 5432` | Puerto equivocado | Revisar puerto en pgAdmin y en `DB_PORT` |
| Tablas no aparecen | API no arrancó o migraciones desactivadas | `TYPEORM_RUN_MIGRATIONS=true` y `npm run start:dev`, o `npm run migration:run` |

### Iniciar el servicio PostgreSQL en Windows

1. `Win + R` → `services.msc`
2. Busca algo como **postgresql-x64-17** (número según tu versión).
3. Clic derecho → **Iniciar** (o **Restart**).

---

## 10. Docker más adelante

Cuando quieras usar Docker, ver [SETUP.md](./SETUP.md) sección Docker. Mientras tanto **no hace falta** `docker compose` para desarrollar en local.

---

## Resumen rápido

1. pgAdmin → conectar **un** servidor (ej. PostgreSQL 17).  
2. Crear base **`back_base_nest`**.  
3. `.env` → `DB_*` con host, **puerto correcto**, usuario, **contraseña real** y nombre de base.  
4. `npm install` y `npm run start:dev` (las migraciones crean todo).  
5. Refrescar tablas en pgAdmin y probar login admin.
