export const TIPOS_ITEM = ['repuesto', 'trabajo'] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];

export const UNIDADES = ['u', 'l', 'kg', 'm', 'h', 'jgo'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const ESTADOS_PRESUPUESTO = [
  'borrador',
  'enviado',
  'aprobado',
  'rechazado',
] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const TIPOS_DESCUENTO = ['porcentaje', 'monto'] as const;
export type TipoDescuento = (typeof TIPOS_DESCUENTO)[number];

export const COMBUSTIBLES = [
  'nafta',
  'diesel',
  'nafta_gnc',
  'hibrido',
  'electrico',
  'otro',
] as const;
export type Combustible = (typeof COMBUSTIBLES)[number];

export const CONDICIONES_IVA = [
  'monotributo',
  'responsable_inscripto',
  'exento',
] as const;
export type CondicionIva = (typeof CONDICIONES_IVA)[number];

export const ALICUOTAS_IVA = [0, 10.5, 21] as const;

/** Transiciones de estado permitidas. Aprobado es final: para recotizar se duplica. */
export const TRANSICIONES_ESTADO: Record<
  EstadoPresupuesto,
  readonly EstadoPresupuesto[]
> = {
  borrador: ['enviado', 'aprobado', 'rechazado'],
  enviado: ['aprobado', 'rechazado', 'borrador'],
  rechazado: ['borrador'],
  aprobado: [],
};

/** Estados en los que el contenido del presupuesto todavía se puede editar. */
export const ESTADOS_EDITABLES: readonly EstadoPresupuesto[] = [
  'borrador',
  'enviado',
];

/** Importes: hasta 999.999.999,99 con punto decimal ("12345.50"). */
export const REGEX_IMPORTE = /^\d{1,9}(\.\d{1,2})?$/;
/** Cantidades: hasta 9.999,999 ("4.5", "0.250"). */
export const REGEX_CANTIDAD = /^\d{1,4}(\.\d{1,3})?$/;
