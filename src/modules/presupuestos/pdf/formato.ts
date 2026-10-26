import { formatoPatente } from '../../../common/normalizers/patente';

/**
 * Formatos para el PDF (los mismos que muestra la pantalla). Los importes y cantidades
 * llegan de la base como texto decimal ("12345.67", "4.500"): se formatean como texto,
 * sin pasar por números de coma flotante.
 */

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "12345.67" -> "$ 12.345,67"; "-50.00" -> "- $ 50,00" */
export function importe(valor: string): string {
  const negativo = valor.trim().startsWith('-');
  const [entero, decimales = ''] = valor.replace('-', '').trim().split('.');
  const texto = `$ ${agruparMiles(entero.replace(/^0+(?=\d)/, ''))},${decimales.padEnd(2, '0').slice(0, 2)}`;
  return negativo ? `- ${texto}` : texto;
}

export const UNIDADES: Record<string, string> = {
  u: 'u',
  l: 'L',
  kg: 'kg',
  m: 'm',
  h: 'h',
  jgo: 'jgo',
};

/** "4.500" -> "4,5"; "1.000" -> "1"; con unidad si no es "u": "4,5 L" */
export function cantidad(valor: string, unidad: string): string {
  const [entero, decimales = ''] = valor.split('.');
  const limpio = decimales.replace(/0+$/, '');
  const texto = limpio
    ? `${agruparMiles(entero)},${limpio}`
    : agruparMiles(entero);
  return unidad === 'u' ? texto : `${texto} ${UNIDADES[unidad] ?? unidad}`;
}

/** "10.50" -> "10,5"; "21.00" -> "21" */
export function porcentaje(valor: string): string {
  const [entero, decimales = ''] = valor.split('.');
  const limpio = decimales.replace(/0+$/, '');
  return limpio ? `${entero},${limpio}` : entero;
}

/** "2026-10-17" -> "17/10/2026" */
export function fecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Para mostrar: "AB 123 CD", "ABC 123", "A 123 BCD", "123 ABC". */
export function patente(valor: string): string {
  switch (formatoPatente(valor)) {
    case 'mercosur':
      return `${valor.slice(0, 2)} ${valor.slice(2, 5)} ${valor.slice(5)}`;
    case 'mercosur_moto':
      return `${valor.slice(0, 1)} ${valor.slice(1, 4)} ${valor.slice(4)}`;
    case 'anterior':
    case 'moto_anterior':
      return `${valor.slice(0, 3)} ${valor.slice(3)}`;
    default:
      return valor;
  }
}

/** "20301234567" -> "20-30123456-7" */
export function cuit(valor: string): string {
  return `${valor.slice(0, 2)}-${valor.slice(2, 10)}-${valor.slice(10)}`;
}

/** 11 dígitos: CUIT; si no: "DNI 12.345.678". */
export function documento(valor: string): string {
  return valor.length === 11
    ? `CUIT ${cuit(valor)}`
    : `DNI ${agruparMiles(valor)}`;
}

/** Códigos de área de 3 dígitos (el resto de Argentina usa 4, salvo AMBA = 11). */
const AREAS_DE_3 = new Set([
  '220',
  '221',
  '223',
  '230',
  '236',
  '237',
  '249',
  '260',
  '261',
  '263',
  '264',
  '266',
  '280',
  '291',
  '294',
  '297',
  '298',
  '299',
  '336',
  '341',
  '342',
  '343',
  '345',
  '348',
  '351',
  '353',
  '358',
  '362',
  '364',
  '370',
  '376',
  '379',
  '380',
  '381',
  '383',
  '385',
  '387',
  '388',
]);

/** "+5493515551234" -> "+54 9 351 555-1234" (misma regla que la pantalla). */
export function telefono(e164: string): string {
  if (!e164.startsWith('+549') || e164.length !== 14) return e164;
  const nacional = e164.slice(4);
  const largoArea = nacional.startsWith('11')
    ? 2
    : AREAS_DE_3.has(nacional.slice(0, 3))
      ? 3
      : 4;
  const area = nacional.slice(0, largoArea);
  const numero = nacional.slice(largoArea);
  return `+54 9 ${area} ${numero.slice(0, -4)}-${numero.slice(-4)}`;
}

export const CONDICIONES_IVA: Record<string, string> = {
  monotributo: 'Monotributo',
  responsable_inscripto: 'IVA Responsable Inscripto',
  exento: 'IVA Exento',
};

export const COMBUSTIBLES: Record<string, string> = {
  nafta: 'Nafta',
  diesel: 'Diésel',
  nafta_gnc: 'Nafta / GNC',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  otro: 'Otro',
};
