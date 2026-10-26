import { BadRequestException, Injectable } from '@nestjs/common';
import { DIAS_PRECIO_VIEJO } from '../../common/constants/dominio.constant';
import {
  escaparLike,
  filasDe,
  normalizarBusqueda,
  patronesPorPalabra,
  vacioANull,
} from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import {
  COLUMNAS_CATALOGO,
  SQL_FALTANTE,
  leerItemCatalogo,
} from './catalogo.sql';
import {
  ActualizarCatalogoItemDto,
  AjustePreciosDto,
  BuscarCatalogoQuery,
  CatalogoItemDto,
  CatalogoItemInputDto,
  CrearCatalogoItemDto,
  PaginaCatalogoDto,
} from './dto/catalogo.dto';

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
      if (query.stock === 'controlado') {
        condiciones.push('ci.controla_stock');
      } else if (query.stock === 'faltante') {
        condiciones.push(SQL_FALTANTE);
      } else if (query.stock === 'sin_control') {
        condiciones.push(`ci.tipo = 'repuesto' AND NOT ci.controla_stock`);
      }
      if (query.precioViejo) {
        condiciones.push(
          `ci.precio_actualizado_en < now() - interval '${DIAS_PRECIO_VIEJO} days'`,
        );
      }

      const patrones = query.q ? patronesPorPalabra(query.q) : [];
      // El listado de stock va por nombre; el autocompletado, por lo más usado.
      let orden = query.stock
        ? 'lower(ci.nombre), lower(ci.marca)'
        : 'ci.veces_usado DESC, ci.nombre';
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
        `SELECT ${COLUMNAS_CATALOGO}, count(*) OVER ()::int AS "totalFilas"
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

  crear(
    tallerId: string,
    usuarioId: string,
    dto: CrearCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      const stockInicial = vacioANull(dto.stockInicial);
      const datos = this.normalizar({
        ...dto,
        controlaStock: dto.controlaStock || stockInicial !== null,
      });
      const [fila] = await em.query<Array<{ id: string }>>(
        `INSERT INTO catalogo_items
                (tipo, nombre, marca, codigo, unidad, precio_referencia, costo_referencia,
                 controla_stock, stock_minimo, ubicacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          datos.tipo,
          datos.nombre,
          datos.marca,
          datos.codigo,
          datos.unidad,
          datos.precioReferencia,
          datos.costoReferencia,
          datos.controlaStock,
          datos.stockMinimo,
          datos.ubicacion,
        ],
      );
      if (stockInicial !== null && Number(stockInicial) !== 0) {
        await em.query(
          `INSERT INTO stock_movimientos (catalogo_item_id, tipo, cantidad, nota, usuario_id)
           VALUES ($1, 'ajuste', $2, 'Stock inicial', $3)`,
          [fila.id, stockInicial, usuarioId],
        );
      }
      return leerItemCatalogo(em, fila.id);
    });
  }

  actualizar(
    tallerId: string,
    usuarioId: string,
    id: string,
    dto: ActualizarCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      const actual = await leerItemCatalogo(em, id, { bloquear: true });
      const datos = this.normalizar({
        ...actual,
        ...dto,
      });
      // Dejar de llevar stock: lo que hubiera se lleva a cero (queda en el historial).
      if (
        actual.controlaStock &&
        !datos.controlaStock &&
        Number(actual.stock) !== 0
      ) {
        await em.query(
          `INSERT INTO stock_movimientos (catalogo_item_id, tipo, cantidad, nota, usuario_id)
           SELECT id, 'ajuste', -stock, 'Dejó de llevar stock', $2
             FROM catalogo_items WHERE id = $1`,
          [id, usuarioId],
        );
      }
      await em.query(
        `UPDATE catalogo_items
            SET tipo = $2, nombre = $3, marca = $4, codigo = $5, unidad = $6,
                precio_referencia = $7, costo_referencia = $8, activo = $9,
                controla_stock = $10, stock_minimo = $11, ubicacion = $12
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
          datos.controlaStock,
          datos.stockMinimo,
          datos.ubicacion,
        ],
      );
      return leerItemCatalogo(em, id);
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

  private normalizar(dto: CatalogoItemInputDto) {
    const nombre = dto.nombre?.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre es obligatorio.');
    }
    const controlaStock = dto.controlaStock ?? false;
    if (controlaStock && dto.tipo !== 'repuesto') {
      throw new BadRequestException('Solo los repuestos llevan stock.');
    }
    return {
      tipo: dto.tipo,
      nombre,
      marca: vacioANull(dto.marca),
      codigo: vacioANull(dto.codigo),
      unidad: dto.unidad ?? 'u',
      precioReferencia: dto.precioReferencia,
      costoReferencia: vacioANull(dto.costoReferencia),
      controlaStock,
      stockMinimo: vacioANull(dto.stockMinimo),
      ubicacion: vacioANull(dto.ubicacion),
    };
  }
}
