import { randomBytes } from 'crypto';

/**
 * Token del enlace público: [id del taller, 16 bytes][parte aleatoria, 24 bytes], ambos en
 * base64url (22 + 32 = 54 caracteres, sin padding).
 *
 * Llevar el taller adentro permite abrir la transacción "dentro" de ese taller y buscar el
 * enlace con Row Level Security como en cualquier otra consulta. La seguridad la da la
 * parte aleatoria (192 bits): conocer el id de un taller no alcanza para ver nada.
 */
const LARGO_TALLER = 22;
const LARGO_ALEATORIO = 32;
const FORMATO = /^[A-Za-z0-9_-]+$/;

export function nuevaParteAleatoria(): string {
  return randomBytes(24).toString('base64url');
}

export function armarTokenPublico(tallerId: string, aleatorio: string): string {
  const bytes = Buffer.from(tallerId.replace(/-/g, ''), 'hex');
  return bytes.toString('base64url') + aleatorio;
}

export function leerTokenPublico(
  token: string,
): { tallerId: string; aleatorio: string } | null {
  if (
    typeof token !== 'string' ||
    token.length !== LARGO_TALLER + LARGO_ALEATORIO ||
    !FORMATO.test(token)
  ) {
    return null;
  }
  const bytes = Buffer.from(token.slice(0, LARGO_TALLER), 'base64url');
  if (bytes.length !== 16) {
    return null;
  }
  const hex = bytes.toString('hex');
  const tallerId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
  return { tallerId, aleatorio: token.slice(LARGO_TALLER) };
}
