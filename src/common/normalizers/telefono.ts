export class TelefonoInvalidoError extends Error {}

/**
 * Normaliza un teléfono a E.164 para que el link de WhatsApp funcione.
 *
 * En Argentina WhatsApp necesita +54 9 + código de área sin el 0 + número sin el 15:
 *   "011 15 2345-6789"   -> +5491123456789
 *   "11 2345 6789"       -> +5491123456789
 *   "0351 15-555-1234"   -> +5493515551234
 *   "+54 9 11 2345 6789" -> +5491123456789
 * Números con + y otro código de país se guardan tal cual (solo dígitos).
 * Se asume celular: el campo es "Teléfono (WhatsApp)".
 */
export function normalizarTelefono(
  entrada: string | null | undefined,
): string | null {
  const crudo = (entrada ?? '').trim();
  if (crudo === '') {
    return null;
  }

  const tieneMas = crudo.startsWith('+');
  let digitos = crudo.replace(/\D/g, '');

  if (tieneMas && !digitos.startsWith('54')) {
    if (digitos.length >= 8 && digitos.length <= 15) {
      return `+${digitos}`;
    }
    throw new TelefonoInvalidoError('El teléfono internacional no es válido.');
  }

  // Código de país argentino (con o sin +). Ningún código de área local empieza con 54.
  if (digitos.startsWith('54') && (tieneMas || digitos.length >= 12)) {
    digitos = digitos.slice(2);
    if (digitos.startsWith('9')) {
      digitos = digitos.slice(1);
    }
  }

  // Prefijo de larga distancia nacional.
  if (digitos.startsWith('0')) {
    digitos = digitos.slice(1);
  }

  // El "15" de celular va después del código de área (de 2, 3 o 4 dígitos).
  if (digitos.length === 12) {
    for (const posicion of [2, 3, 4]) {
      if (digitos.slice(posicion, posicion + 2) === '15') {
        digitos = digitos.slice(0, posicion) + digitos.slice(posicion + 2);
        break;
      }
    }
  }

  // Área + número siempre suman 10 dígitos. Las áreas empiezan con 11, 2 o 3.
  if (digitos.length !== 10 || !/^(11|2|3)/.test(digitos)) {
    throw new TelefonoInvalidoError(
      'Ingresá código de área y número, por ejemplo 11 2345 6789 o 351 555 1234.',
    );
  }

  return `+549${digitos}`;
}
