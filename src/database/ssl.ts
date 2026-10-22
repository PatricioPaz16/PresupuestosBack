import { readFileSync } from 'fs';
import type { TlsOptions } from 'tls';

/**
 * SSL hacia PostgreSQL (Supabase y las bases en la nube lo usan).
 *
 *   DB_SSL=true               conexión cifrada.
 *   DB_SSL_CA=ruta/al/ca.crt  además verifica el certificado del servidor con esa CA
 *                             (Supabase: Database Settings > SSL Configuration).
 *
 * Sin DB_SSL_CA la conexión va cifrada pero no se comprueba el certificado del servidor.
 */
export function opcionesSsl(
  activo: boolean,
  rutaCa?: string,
): false | TlsOptions {
  if (!activo) {
    return false;
  }
  if (rutaCa) {
    return { ca: readFileSync(rutaCa, 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}
