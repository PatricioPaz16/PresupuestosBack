import { EntityManager } from 'typeorm';

/**
 * Catálogo y datos de ejemplo (SEED_DEMO=true). Se ejecuta dentro del contexto del
 * taller (RLS), así que no hace falta indicar taller_id. Solo carga si el catálogo está vacío.
 */

type Fila = [
  tipo: 'repuesto' | 'trabajo',
  nombre: string,
  marca: string | null,
  unidad: string,
  precio: number,
  costo: number | null,
];

const CATALOGO: Fila[] = [
  ['repuesto', 'Aceite 10W40 semisintético', 'Elaion', 'l', 14500, 10800],
  ['repuesto', 'Aceite 5W30 sintético', 'Total', 'l', 21900, 16400],
  ['repuesto', 'Filtro de aceite', 'Fram', 'u', 12800, 8900],
  ['repuesto', 'Filtro de aire', 'Fram', 'u', 18500, 12900],
  ['repuesto', 'Filtro de combustible', 'Mann', 'u', 16900, 11800],
  ['repuesto', 'Filtro de habitáculo', 'Mann', 'u', 15400, 10700],
  ['repuesto', 'Pastillas de freno delanteras', 'Ferodo', 'jgo', 68000, 47500],
  ['repuesto', 'Discos de freno delanteros', 'Fremax', 'jgo', 142000, 99000],
  ['repuesto', 'Líquido de frenos DOT 4', 'Bosch', 'l', 11900, 8200],
  ['repuesto', 'Kit de distribución', 'SKF', 'jgo', 248000, 176000],
  ['repuesto', 'Bomba de agua', 'SKF', 'u', 96000, 67000],
  ['repuesto', 'Bujía', 'NGK', 'u', 9800, 6600],
  ['repuesto', 'Correa poly-V', 'Gates', 'u', 34500, 23800],
  ['repuesto', 'Amortiguador delantero', 'Corven', 'u', 118000, 82000],
  ['repuesto', 'Extremo de dirección', 'Mazzon', 'u', 38500, 26500],
  ['repuesto', 'Rótula de suspensión', 'Mazzon', 'u', 42000, 29000],
  ['repuesto', 'Batería 12V 65Ah', 'Moura', 'u', 189000, 139000],
  ['repuesto', 'Refrigerante orgánico', 'Paraflu', 'l', 8900, 6100],
  ['trabajo', 'Cambio de aceite y filtro', null, 'u', 25000, null],
  ['trabajo', 'Cambio de kit de distribución', null, 'u', 180000, null],
  ['trabajo', 'Cambio de pastillas de freno', null, 'u', 45000, null],
  ['trabajo', 'Rectificado de discos', null, 'jgo', 52000, 36000],
  ['trabajo', 'Alineación y balanceo', null, 'u', 48000, 32000],
  ['trabajo', 'Diagnóstico con escáner', null, 'u', 30000, null],
  ['trabajo', 'Cambio de amortiguadores (par)', null, 'u', 85000, null],
  ['trabajo', 'Mano de obra', null, 'h', 32000, null],
];

export async function sembrarDatosDemo(em: EntityManager): Promise<boolean> {
  const [{ cantidad }] = await em.query<Array<{ cantidad: number }>>(
    `SELECT count(*)::int AS cantidad FROM catalogo_items`,
  );
  if (cantidad > 0) {
    return false;
  }

  for (const [tipo, nombre, marca, unidad, precio, costo] of CATALOGO) {
    await em.query(
      `INSERT INTO catalogo_items (tipo, nombre, marca, unidad, precio_referencia, costo_referencia)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tipo, nombre, marca, unidad, precio, costo],
    );
  }

  const [juan] = await em.query<Array<{ id: string }>>(
    `INSERT INTO clientes (nombre, apellido, telefono, email)
     VALUES ('Juan', 'Pérez', '+5493515551234', 'juan.perez@example.com') RETURNING id`,
  );
  const [flota] = await em.query<Array<{ id: string }>>(
    `INSERT INTO clientes (nombre, razon_social, telefono, documento)
     VALUES ('Laura Gómez', 'Distribuidora del Centro SRL', '+5493514448899', '30712345678') RETURNING id`,
  );

  await em.query(
    `INSERT INTO vehiculos (cliente_id, patente, marca, modelo, version, anio, color, combustible)
     VALUES ($1, 'AB123CD', 'Volkswagen', 'Gol Trend', '1.6 MSI', 2017, 'Gris plata', 'nafta'),
            ($1, 'KJT482', 'Renault', 'Kangoo', '1.6 8v', 2011, 'Blanco', 'nafta_gnc'),
            ($2, 'AF456GH', 'Toyota', 'Hilux', '2.8 TDI SRV', 2022, 'Negro', 'diesel')`,
    [juan.id, flota.id],
  );

  return true;
}
