import { types } from 'pg';

const OID_DATE = 1082;

/**
 * Las columnas `date` se devuelven tal cual ('2026-10-17'). Por defecto `pg` las
 * convierte a Date en la zona horaria del servidor y una fecha puede correrse un día.
 * `numeric` ya llega como string (sin pérdida de precisión): se mantiene así.
 */
export function configurarTiposPg(): void {
  types.setTypeParser(OID_DATE, (valor: string) => valor);
}
