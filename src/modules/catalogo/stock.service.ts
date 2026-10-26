import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DIAS_PRECIO_VIEJO } from '../../common/constants/dominio.constant';
import { vacioANull } from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import { UsersService } from '../users/users.service';
import { SQL_FALTANTE, leerItemCatalogo } from './catalogo.sql';
import type { CatalogoItemDto } from './dto/catalogo.dto';
import {
  AjusteStockDto,
  IngresoStockDto,
  MovimientoStockDto,
  MovimientosQuery,
  PaginaMovimientosDto,
  ResumenStockDto,
} from './dto/stock.dto';

type MovimientoCrudo = Omit<MovimientoStockDto, 'usuarioNombre'> & {
  usuarioId: string | null;
  totalFilas: number;
};

/**
 * Stock de repuestos. El stock de cada repuesto lo mantiene la base: cada movimiento
 * (ingreso, ajuste o presupuesto aprobado) lo suma y deja anotado cómo quedó.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly tenant: TenantService,
    private readonly users: UsersService,
  ) {}

  /** Compra de mercadería. Si trae costo o precio, actualiza los del catálogo. */
  ingreso(
    tallerId: string,
    usuarioId: string,
    id: string,
    dto: IngresoStockDto,
  ): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      await this.repuestoParaStock(em, id);
      if (Number(dto.cantidad) <= 0) {
        throw new BadRequestException(
          'La cantidad tiene que ser mayor que cero.',
        );
      }
      const costo = vacioANull(dto.costoUnitario);
      const precio = vacioANull(dto.precioVenta);

      await em.query(
        `INSERT INTO stock_movimientos
                (catalogo_item_id, tipo, cantidad, costo_unitario, proveedor, comprobante, nota,
                 usuario_id)
         VALUES ($1, 'ingreso', $2, $3, $4, $5, $6, $7)`,
        [
          id,
          dto.cantidad,
          costo,
          vacioANull(dto.proveedor),
          vacioANull(dto.comprobante),
          vacioANull(dto.nota),
          usuarioId,
        ],
      );
      if (costo !== null || precio !== null) {
        await em.query(
          `UPDATE catalogo_items
              SET costo_referencia = coalesce($2::numeric, costo_referencia),
                  precio_referencia = coalesce($3::numeric, precio_referencia)
            WHERE id = $1`,
          [id, costo, precio],
        );
      }
      return leerItemCatalogo(em, id);
    });
  }

  /**
   * Conteo: se informa lo que hay y se registra la diferencia. También sirve para cargar
   * el stock inicial de un repuesto que todavía no llevaba stock.
   */
  ajuste(
    tallerId: string,
    usuarioId: string,
    id: string,
    dto: AjusteStockDto,
  ): Promise<CatalogoItemDto> {
    return this.tenant.run(tallerId, async (em) => {
      const item = await this.repuestoParaStock(em, id);
      const nota =
        vacioANull(dto.nota) ??
        (item.controlaStock ? 'Conteo' : 'Stock inicial');

      await em.query(
        `INSERT INTO stock_movimientos (catalogo_item_id, tipo, cantidad, nota, usuario_id)
         SELECT id, 'ajuste', $2::numeric - stock, $3, $4
           FROM catalogo_items
          WHERE id = $1 AND stock <> $2::numeric`,
        [id, dto.stockReal, nota, usuarioId],
      );
      // Contar "0" en un repuesto nuevo no genera movimiento, pero sí activa el control.
      await em.query(
        `UPDATE catalogo_items SET controla_stock = true WHERE id = $1 AND NOT controla_stock`,
        [id],
      );
      return leerItemCatalogo(em, id);
    });
  }

  async movimientos(
    tallerId: string,
    id: string,
    query: MovimientosQuery,
  ): Promise<PaginaMovimientosDto> {
    const filas = await this.tenant.run(tallerId, async (em) => {
      await leerItemCatalogo(em, id);
      return em.query<MovimientoCrudo[]>(
        `SELECT m.id, m.tipo, m.cantidad::text AS cantidad,
                m.stock_resultante::text AS "stockResultante",
                m.costo_unitario::text AS "costoUnitario",
                m.proveedor, m.comprobante, m.nota, m.created_at AS fecha,
                CASE WHEN p.id IS NULL THEN NULL
                     ELSE json_build_object('id', p.id, 'numero', p.numero) END AS presupuesto,
                m.usuario_id AS "usuarioId",
                count(*) OVER ()::int AS "totalFilas"
           FROM stock_movimientos m
           LEFT JOIN presupuestos p ON p.id = m.presupuesto_id
          WHERE m.catalogo_item_id = $1
          ORDER BY m.created_at DESC, m.id
          LIMIT $2 OFFSET $3`,
        [id, query.limit ?? 50, query.offset ?? 0],
      );
    });

    // Los nombres de usuario se leen fuera del rol de negocio (no tiene acceso a users).
    const nombres = await this.users.nombresPorId(
      tallerId,
      filas.map((f) => f.usuarioId).filter((u): u is string => !!u),
    );
    return {
      items: filas.map(({ usuarioId, totalFilas: _total, ...movimiento }) => ({
        ...movimiento,
        usuarioNombre: usuarioId ? (nombres.get(usuarioId) ?? null) : null,
      })),
      total: filas[0]?.totalFilas ?? 0,
    };
  }

  resumen(tallerId: string): Promise<ResumenStockDto> {
    return this.tenant.run(tallerId, async (em) => {
      const [fila] = await em.query<ResumenStockDto[]>(
        `SELECT count(*)::int AS repuestos,
                count(*) FILTER (WHERE ${SQL_FALTANTE})::int AS faltantes,
                count(*) FILTER (WHERE ci.stock < 0)::int AS negativos,
                coalesce(sum(round(ci.stock * ci.costo_referencia, 2))
                           FILTER (WHERE ci.stock > 0), 0)::text AS "valorCosto",
                coalesce(sum(round(ci.stock * ci.precio_referencia, 2))
                           FILTER (WHERE ci.stock > 0), 0)::text AS "valorVenta",
                count(*) FILTER (WHERE ci.stock > 0 AND ci.costo_referencia IS NULL)::int
                  AS "sinCosto",
                count(*) FILTER (
                  WHERE ci.precio_actualizado_en < now() - interval '${DIAS_PRECIO_VIEJO} days'
                )::int AS "preciosViejos"
           FROM catalogo_items ci
          WHERE ci.activo AND ci.controla_stock`,
      );
      return fila;
    });
  }

  /** Solo repuestos activos llevan stock. Bloquea la fila hasta el fin de la transacción. */
  private async repuestoParaStock(
    em: EntityManager,
    id: string,
  ): Promise<CatalogoItemDto> {
    const item = await leerItemCatalogo(em, id, { bloquear: true });
    if (item.tipo !== 'repuesto') {
      throw new BadRequestException('Solo los repuestos llevan stock.');
    }
    if (!item.activo) {
      throw new ConflictException(
        'El repuesto está desactivado: activalo en el catálogo para moverle stock.',
      );
    }
    return item;
  }
}
