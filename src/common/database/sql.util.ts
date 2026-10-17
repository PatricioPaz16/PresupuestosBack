/** Escapa comodines de LIKE en texto ingresado por el usuario. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Minúsculas y sin acentos (misma regla que la columna generada `busqueda`). */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Convierte "filtro  fram" en ['%filtro%', '%fram%'] para `busqueda LIKE ALL($n)`. */
export function patronesPorPalabra(texto: string, maxPalabras = 6): string[] {
  return normalizarBusqueda(texto)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxPalabras)
    .map((palabra) => `%${escaparLike(palabra)}%`);
}

/**
 * `EntityManager.query()` devuelve `[filas, cantidad]` para UPDATE/DELETE en PostgreSQL
 * y solo `filas` para SELECT/INSERT. Esto unifica ambos casos.
 */
export function filasDe<T>(resultado: unknown): T[] {
  if (
    Array.isArray(resultado) &&
    resultado.length === 2 &&
    Array.isArray(resultado[0]) &&
    typeof resultado[1] === 'number'
  ) {
    return resultado[0] as T[];
  }
  return resultado as T[];
}

export function vacioANull<T extends string | null | undefined>(
  valor: T,
): string | null {
  if (valor === undefined || valor === null) {
    return null;
  }
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
