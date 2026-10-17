import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  escaparLike,
  filasDe,
  normalizarBusqueda,
  patronesPorPalabra,
  vacioANull,
} from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import {
  ActualizarCatalogoItemDto,
  AjustePreciosDto,
  BuscarCatalogoQuery,
  CatalogoItemDto,
  CatalogoItemInputDto,
  PaginaCatalogoDto,
} from './dto/catalogo.dto';

const COLUMNAS = `
  ci.id, ci.tipo, ci.nombre, ci.marca, ci.codigo, ci.unidad,
  ci.precio_referencia::text AS "precioReferencia",
  ci.costo_referencia::text AS "costoReferencia",
  ci.precio_actualizado_en AS "precioActualizadoEn",
  ci.veces_usado AS "vecesUsado", ci.activo`;

@Injectable()
export class CatalogoService {
  constructor(private readonly tenant: TenantService) {}

  /**
   * Autocompletado y listado. Todas las palabras tienen que aparecer (sin importar acentos
   * ni mayúsculas); primero lo que empieza con lo escrito y después lo más usado.
   */
  buscar(
    tallerId: string,
    query: BuscarCatalogoQuery,
  ): Promise<PaginaCatalogoDto> {
    return this.tenant.run(tallerId, async (em) => {
      const valores: unknown[] = [];
      const condiciones: string[] = [];

      if (!query.incluirInactivos) {
        condiciones.push('ci.activo');
      }
      if (query.tipo) {
        valores.push(query.tipo);
        condiciones.push(`ci.tipo = $${valores.length}`);
      }

      const patrones = query.q ? patronesPorPalabra(query.q) : [];
      let orden = 'ci.veces_usado DESC, ci.nombre';
      if (patrones.length > 0) {
        valores.push(patrones);
        condiciones.push(`ci.busqueda LIKE ALL ($${valores.length}::text[])`);
        valores.push(`${escaparLike(normalizarBusqueda(query.q!))}%`);
        orden = `(ci.busqueda LIKE $${valores.length}) DESC, ${orden}`;
      }

      valores.push(query.limit ?? 20, query.offset ?? 0);
      const filas = await em.query<
        Array<CatalogoItemDto & { totalFilas: number }>
      >(
        `SELECT ${COLUMNAS}, count(*) OVER ()::int AS "totalFilas"
           FROM catalogo_items ci
          ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
          ORDER BY ${orden}
          LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores,
      );

      return {
        items: filas.map(({ totalFilas: _total, ...item }) => item),
        total: filas[0]?.totalFilas ?? 0,
      };
    });
  }

  crear(tallerId: string, dto: CatalogoItemInputDto): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      const datos = this.normalizar(dto);
      const [fila] = await em.query<Array<{ id: string }>>(
        `INSERT INTO catalogo_items (tipo, nombre, marca, codigo, unidad, precio_referencia, costo_referencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          datos.tipo,
          datos.nombre,
          datos.marca,
          datos.codigo,
          datos.unidad,
          datos.precioReferencia,
          datos.costoReferencia,
        ],
      );
      return this.leer(em, fila.id);
    });
  }

  actualizar(
    tallerId: string,
    id: string,
    dto: ActualizarCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      const actual = await this.leer(em, id);
      const datos = this.normalizar({
        ...actual,
        ...dto,
      });
      await em.query(
        `UPDATE catalogo_items
            SET tipo = $2, nombre = $3, marca = $4, codigo = $5, unidad = $6,
                precio_referencia = $7, costo_referencia = $8, activo = $9
          WHERE id = $1`,
        [
          id,
          datos.tipo,
          datos.nombre,
          datos.marca,
          datos.codigo,
          datos.unidad,
          datos.precioReferencia,
          datos.costoReferencia,
          dto.activo ?? actual.activo,
        ],
      );
      return this.leer(em, id);
    });
  }

  /** Actualización masiva de precios (inflación). Devuelve cuántos ítems cambiaron. */
  ajustarPrecios(
    tallerId: string,
    dto: AjustePreciosDto,
  ): Promise<{ actualizados: number }> {
    return this.tenant.run(tallerId, async (em) => {
      const valores: unknown[] = [dto.porcentaje, dto.tipo ?? null];
      const factor = `(1 + $1::numeric / 100)`;
      let precio = `greatest(round(precio_referencia * ${factor}, 2), 0)`;
      if ((dto.redondeo ?? 0) > 0) {
        valores.push(dto.redondeo);
        precio = `greatest(round(precio_referencia * ${factor} / $3::numeric) * $3::numeric, 0)`;
      }
      const costo = dto.incluirCosto
        ? `, costo_referencia = round(costo_referencia * ${factor}, 2)`
        : '';

      const filas = filasDe<{ id: string }>(
        await em.query(
          `UPDATE catalogo_items
              SET precio_referencia = ${precio} ${costo}
            WHERE activo AND ($2::tipo_item IS NULL OR tipo = $2::tipo_item)
            RETURNING id`,
          valores,
        ),
      );
      return { actualizados: filas.length };
    });
  }

  private async leer(em: EntityManager, id: string): Promise<CatalogoItemDto> {
    const [item] = await em.query<CatalogoItemDto[]>(
      `SELECT ${COLUMNAS} FROM catalogo_items ci WHERE ci.id = $1`,
      [id],
    );
    if (!item) {
      throw new NotFoundException('Ítem de catálogo no encontrado.');
    }
    return item;
  }

  private normalizar(dto: CatalogoItemInputDto) {
    const nombre = dto.nombre?.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre es obligatorio.');
    }
    return {
      tipo: dto.tipo,
      nombre,
      marca: vacioANull(dto.marca),
      codigo: vacioANull(dto.codigo),
      unidad: dto.unidad ?? 'u',
      precioReferencia: dto.precioReferencia,
      costoReferencia: vacioANull(dto.costoReferencia),
    };
  }
}
