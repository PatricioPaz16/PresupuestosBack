import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { CatalogoItemDto } from './dto/catalogo.dto';

/** Columnas de un ítem del catálogo (alias `ci`). Importes y cantidades como texto. */
export const COLUMNAS_CATALOGO = `
  ci.id, ci.tipo, ci.nombre, ci.marca, ci.codigo, ci.unidad,
  ci.precio_referencia::text AS "precioReferencia",
  ci.costo_referencia::text AS "costoReferencia",
  ci.precio_actualizado_en AS "precioActualizadoEn",
  ci.veces_usado AS "vecesUsado", ci.activo,
  ci.controla_stock AS "controlaStock",
  ci.stock::text AS "stock",
  ci.stock_minimo::text AS "stockMinimo",
  ci.ubicacion`;

/** Faltante (alias `ci`): en el mínimo o debajo; sin mínimo, en cero o menos. */
export const SQL_FALTANTE = `(ci.controla_stock AND ci.stock <= coalesce(ci.stock_minimo, 0))`;

/** Lee un ítem del catálogo (404 si no existe en el taller). */
export async function leerItemCatalogo(
  em: EntityManager,
  id: string,
  { bloquear = false } = {},
): Promise<CatalogoItemDto> {
  const [item] = await em.query<CatalogoItemDto[]>(
    `SELECT ${COLUMNAS_CATALOGO} FROM catalogo_items ci WHERE ci.id = $1${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!item) {
    throw new NotFoundException('Ítem de catálogo no encontrado.');
  }
  return item;
}
