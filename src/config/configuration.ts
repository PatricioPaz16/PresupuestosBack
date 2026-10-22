/**
 * Cuántos proxies hay delante de la API (Render, Vercel…). Express lo usa para saber la IP
 * real del cliente, que es la que cuenta el límite de intentos de login.
 *   sin definir  -> 1 en producción, ninguno en desarrollo
 *   true         -> la IP de más a la izquierda de X-Forwarded-For
 *   número       -> cantidad de saltos de confianza
 */
function interpretarTrustProxy(
  valor: string | undefined,
  nodeEnv: string | undefined,
): boolean | number | string {
  if (valor === undefined || valor.trim() === '') {
    return nodeEnv === 'production' ? 1 : false;
  }
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor; // 'loopback', lista de IPs o subredes, etc.
}

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  trustProxy: interpretarTrustProxy(
    process.env.TRUST_PROXY,
    process.env.NODE_ENV,
  ),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'back_base_nest',
    // Supabase y bases en la nube: DB_SSL=true (ver src/database/ssl.ts).
    ssl: process.env.DB_SSL === 'true',
    sslCa: process.env.DB_SSL_CA || undefined,
    // Las migraciones corren al iniciar salvo TYPEORM_RUN_MIGRATIONS=false.
    // TYPEORM_SYNC ya no se usa (ver DatabaseModule).
    runMigrations: process.env.TYPEORM_RUN_MIGRATIONS !== 'false',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    accessCookieMaxAgeMs: parseInt(
      process.env.JWT_ACCESS_COOKIE_MAX_AGE_MS ?? '900000',
      10,
    ),
    refreshCookieMaxAgeMs: parseInt(
      process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS ?? '604800000',
      10,
    ),
  },
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAME_SITE ?? 'strict') as
      | 'strict'
      | 'lax'
      | 'none',
  },
  security: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES ?? '15', 10),
  },
  throttle: {
    loginLimit: parseInt(process.env.THROTTLE_LOGIN_LIMIT ?? '5', 10),
    loginTtlMs: parseInt(process.env.THROTTLE_LOGIN_TTL_MS ?? '60000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
    // Catálogo y datos de ejemplo en el taller inicial (solo si está vacío).
    demo: process.env.SEED_DEMO === 'true',
  },
  bodyLimit: process.env.BODY_LIMIT ?? '1mb',
});
