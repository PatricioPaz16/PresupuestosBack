# Prompt para IA de Frontend (Angular)

> **Nota:** este prompt es el que se usó para generar la base del front. El frontend ya
> existe (`PresupuestosFront`) y consume además los endpoints de talleres, clientes,
> vehículos, catálogo y presupuestos. El contrato de autenticación de abajo sigue vigente;
> para el resto, ver [README.md](./README.md), [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md)
> y Swagger (`/api/docs`). `UserResponseDto` ahora incluye `taller`, `isActive` y
> `lastLoginAt`, y las rutas privadas del front empiezan en `/presupuestos`.

Copia el contenido del bloque siguiente y envíaselo a tu IA de frontend para generar el cliente alineado con este backend (`BackBaseNest`).

---

```
Actúa como un Staff Frontend Engineer experto en Angular. Tu tarea es generar un repositorio base desde cero utilizando la última versión estable de Angular. El backend ya existe (NestJS 11) y expone una API con autenticación por cookies HttpOnly. Debes consumirla EXACTAMENTE como se describe aquí.

---

## CONTEXTO DEL BACKEND (contrato real)

- **Base URL desarrollo:** `http://localhost:3000`
- **Prefijo global:** `/api`
- **CORS:** el backend solo acepta el origen configurado en `FRONTEND_URL` (por defecto `http://localhost:4200`) con `credentials: true`. El origen del front debe coincidir carácter por carácter.
- **Autenticación:** el JWT NO viaja en el body ni en `Authorization: Bearer`. El servidor inyecta dos cookies HttpOnly:
  - `access_token` — path `/`, duración ~15 min (JWT de acceso)
  - `refresh_token` — path `/api/auth`, duración ~7 días (rotación en servidor)
- El cliente **NO** debe usar `localStorage`, `sessionStorage` ni leer cookies de sesión con JavaScript.
- Swagger del backend (referencia): `http://localhost:3000/api/docs`

---

## 1. SEGURIDAD Y HTTP (REGLA CRÍTICA)

### 1.1 HttpInterceptor global (`core/interceptors/credentials.interceptor.ts`)
- En **todas** las peticiones hacia la API (`environment.apiUrl`), añadir `withCredentials: true`.
- Opcional: enviar cabecera `x-request-id` (UUID) para correlación con logs del backend.

### 1.2 Interceptor de errores / refresh (`core/interceptors/auth.interceptor.ts`)
Implementar manejo centralizado:

| Status | Acción en el front |
|--------|-------------------|
| `401` en rutas protegidas (excepto login/refresh) | Intentar **una vez** `POST /api/auth/refresh` con `withCredentials: true`. Si resuelve OK, reintentar la petición original. Si falla → limpiar estado de auth y redirigir a `/login`. |
| `429` | Mostrar mensaje de rate limit o cuenta bloqueada (login throttled / lockout por intentos fallidos). |
| `400` | Mostrar errores de validación del backend (`ValidationPipe`). |

**Importante:** `POST /api/auth/refresh` solo envía la cookie `refresh_token` (path `/api/auth`). No enviar body. Respuesta: `{ message: 'Session refreshed' }`. Las nuevas cookies vienen en `Set-Cookie`.

### 1.3 Prohibiciones
- No guardar tokens en storage del navegador.
- No usar `Authorization: Bearer` para esta API.
- No asumir que el login devuelve un token en JSON.

### 1.4 Environment (`src/environments/environment.ts`)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
};
```

En producción, `apiUrl` apunta al dominio HTTPS del API. Si front y API están en dominios distintos, el backend debe tener `COOKIE_SECURE=true`, `SameSite` y CORS alineados.

---

## 2. ENDPOINTS A CONSUMIR

Implementar en `core/services/auth.service.ts` y, si aplica, `features/admin/services/users.service.ts`:

| Método | Ruta | Auth | Body | Respuesta exitosa |
|--------|------|------|------|-------------------|
| `POST` | `/api/auth/login` | Pública | `LoginDto` | `UserResponseDto` (200). Cookies `access_token` + `refresh_token` en `Set-Cookie`. |
| `POST` | `/api/auth/refresh` | Pública* | vacío | `{ message: string }` (200). Renueva cookies. |
| `POST` | `/api/auth/logout` | Cookie `access_token` | vacío | `{ message: string }` (200). Revoca refresh y borra cookies. |
| `GET` | `/api/auth/me` | Cookie `access_token` | — | `UserResponseDto` (200) o `401` si sesión inválida. |
| `GET` | `/api/users` | Cookie + rol `ADMIN` | — | `UserResponseDto[]` (200) o `403` si no es admin. |

\* `refresh` requiere cookie `refresh_token` válida (el navegador la adjunta solo en URLs bajo `/api/auth/*`).

### 2.1 Flujo de autenticación obligatorio

1. **Bootstrap (`APP_INITIALIZER`):** llamar `GET /api/auth/me` con `withCredentials: true`.
   - 200 → hidratar estado del usuario (signal/store) y permitir rutas privadas.
   - 401 → usuario no autenticado; rutas públicas solo (login).
2. **Login:** `POST /api/auth/login` → guardar `UserResponseDto` en estado (signal/`AuthStore`) → navegar al dashboard según rol.
3. **Sesión activa:** el access token expira ~15 min; ante `401` en cualquier request, usar refresh automático (sección 1.2).
4. **Logout:** `POST /api/auth/logout` → limpiar estado local → `router.navigate(['/login'])`.

### 2.2 Guardas de rutas
- `authGuard`: permite acceso solo si hay usuario en estado (o `/me` exitoso).
- `roleGuard` / `adminGuard`: permite acceso solo si `user.role.name === 'ADMIN'` (para panel de usuarios).
- `guestGuard`: en `/login`, redirigir al dashboard si ya hay sesión.

Usar `RoleName` enum: `'ADMIN' | 'USER'`.

---

## 3. MODELOS COMPARTIDOS (`shared/models/auth.models.ts`)

Alineados **exactamente** con el backend (no inventar campos):

```typescript
export type RoleName = 'ADMIN' | 'USER';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RoleDto {
  id: number;
  name: RoleName;
  // El backend NO expone permissions en UserResponseDto.
  // Autorización en front: usar solo role.name.
}

export interface UserResponseDto {
  id: string;        // UUID
  email: string;
  fullName: string;
  role: RoleDto;
}
```

### Validaciones del formulario de login (espejo del backend)
Deben coincidir con `LoginDto` del API:

- **email:** formato email válido.
- **password:** mínimo 8 caracteres; al menos 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.

Regex de referencia (misma regla que el back):
`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/`

Mensaje de error sugerido: *"Mínimo 8 caracteres con mayúscula, minúscula, número y carácter especial"*.

---

## 4. ARQUITECTURA ANGULAR

### 4.1 Standalone (obligatorio)
- Solo **Standalone Components**. Prohibido `NgModules` y `app.module.ts`.
- `app.config.ts` con `provideRouter`, `provideHttpClient(withInterceptors([...]))`, `provideAnimationsAsync()`.

### 4.2 Estructura de carpetas sugerida
```
src/app/
├── core/
│   ├── guards/          (auth.guard, admin.guard, guest.guard)
│   ├── interceptors/    (credentials, auth-refresh)
│   ├── services/        (auth.service, animation.service)
│   └── layout/          (main-layout con sidebar)
├── shared/
│   └── models/          (auth.models.ts)
├── features/
│   ├── auth/            (login)
│   └── admin/           (users-list, solo ADMIN)
└── app.routes.ts
```

### 4.3 Estado de autenticación
- Preferir **signals** (`user = signal<UserResponseDto | null>(null)`) o un servicio singleton `AuthService` con `computed`/`effect`.
- Exponer: `isAuthenticated`, `isAdmin`, `currentUser`.
- El estado se deriva de `/me` y se actualiza tras login/logout.

---

## 5. UI, ANIMACIONES Y LAYOUT

- **Tailwind CSS:** configurar `tailwind.config.js` y `postcss.config.js` correctamente para dev y build de producción.
- **Angular Material:** layout principal con `mat-sidenav` (sidebar). 100% responsive con `BreakpointObserver` (colapsar/ocultar en móvil).
- **Three.js + GSAP:** servicio central `core/services/animation.service.ts` con `init`, `dispose`, `ngOnDestroy` en componentes que lo usen (evitar memory leaks).
- **Menú lateral:** enlaces según rol (`USER` vs `ADMIN`). Ocultar "Usuarios" si `role.name !== 'ADMIN'`.

---

## 6. PATRONES DE CÓDIGO

- HTML en archivos `.html` separados. **Prohibido** `template: \`...\``.
- **Prohibido** `*ngIf`, `*ngFor`, `*ngSwitch`. Usar solo Control Flow: `@if`, `@for`, `@switch`.
- Login: **Reactive Forms** (`FormBuilder`, `FormGroup`, `Validators`) con feedback en tiempo real.
- Mensajes de error HTTP user-friendly (toast o `MatSnackBar`).

---

## 7. RUTAS SUGERIDAS

| Ruta | Componente | Guard |
|------|------------|-------|
| `/login` | LoginComponent | `guestGuard` |
| `/dashboard` | DashboardComponent | `authGuard` |
| `/admin/users` | UsersListComponent | `authGuard` + `adminGuard` |
| `**` | redirect según sesión | — |

---

## 8. PRUEBAS MANUALES CONTRA EL BACKEND

Con el API en marcha (`npm run start:dev`) y seed por defecto:

- **Admin:** `admin@example.com` / `Admin123!`
- Verificar en DevTools → Application → Cookies que existen `access_token` y `refresh_token` tras login (no leer valores; solo comprobar presencia).
- Network: todas las llamadas al API con `credentials: include` / `withCredentials: true`.

---

## 9. ENTREGABLES

1. Proyecto Angular compilable (`ng build` sin errores).
2. `AuthService` completo (login, logout, me, refresh).
3. Interceptors registrados globalmente.
4. Guards y rutas protegidas por rol.
5. Layout responsive con Material sidenav.
6. Pantalla login + listado de usuarios (ADMIN).
7. README breve: cómo apuntar `apiUrl`, requisito de `withCredentials`, y credenciales de prueba del seed.

Sigue ESTRICTAMENTE este contrato. No improvises campos del API ni mecanismos de auth distintos a cookies HttpOnly.
```

---

## Referencia rápida del backend

| Recurso | URL / valor |
|---------|-------------|
| API base | `http://localhost:3000/api` |
| Swagger | `http://localhost:3000/api/docs` |
| Health | `GET /api/health`, `GET /api/health/ready` |
| Admin seed | `admin@example.com` / `Admin123!` |
| README backend | Ver `README.md` en este repositorio |
