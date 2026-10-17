export type FormatoPatente =
  | 'mercosur' // AB123CD (autos desde 2016)
  | 'mercosur_moto' // A123BCD
  | 'anterior' // ABC123 (1995-2016)
  | 'moto_anterior' // 123ABC
  | 'otro'; // provinciales viejas, acoplados, etc. (se aceptan igual)

/** "ab-123 cd" -> "AB123CD". Mayúsculas, sin espacios, guiones ni acentos. */
export function normalizarPatente(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function esPatenteValida(patente: string): boolean {
  return /^[A-Z0-9]{5,10}$/.test(patente);
}

export function formatoPatente(patente: string): FormatoPatente {
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(patente)) return 'mercosur';
  if (/^[A-Z]\d{3}[A-Z]{3}$/.test(patente)) return 'mercosur_moto';
  if (/^[A-Z]{3}\d{3}$/.test(patente)) return 'anterior';
  if (/^\d{3}[A-Z]{3}$/.test(patente)) return 'moto_anterior';
  return 'otro';
}
