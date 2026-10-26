import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ESTADOS_EDITABLES,
  type EstadoPresupuesto,
  TRANSICIONES_ESTADO,
} from '../../common/constants/dominio.constant';
import {
  escaparLike,
  filasDe,
  patronesPorPalabra,
  vacioANull,
} from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import { normalizarPatente } from '../../common/normalizers/patente';
import { UsersService } from '../users/users.service';
import {
  ActualizarPresupuestoDto,
  CambiarEstadoDto,
  DocumentoItemDto,
  EnlacePublicoDto,
  GuardarPresupuestoDto,
  ListarPresupuestosQuery,
  PaginaPresupuestosDto,
  PresupuestoDetalleDto,
  PresupuestoDocumentoDto,
  PresupuestoItemDto,
  PresupuestoResumenDto,
} from './dto/presupuesto.dto';
import {
  SQL_DETALLE,
  SQL_DOCUMENTO,
  SQL_ITEMS_ACTUALIZAR,
  SQL_ITEMS_BORRAR,
  SQL_ITEMS_INSERTAR,
} from './presupuestos.sql';
import {
  armarTokenPublico,
  leerTokenPublico,
  nuevaParteAleatoria,
} from './publico/token-publico';

const ENLACE_NO_DISPONIBLE =
  'Este presupuesto no está disponible. Pedile al taller que te lo vuelva a enviar.';

const NOMBRES_ESTADO: Record<EstadoPresupuesto, string> = {
  borrador: 'borrador',
  enviado: 'enviado',
  aprobado: 'aprobado',
  rechazado: 'rechazado',
};

export const LEYENDA_DOCUMENTO = 'Documento no válido como factura.';

interface ItemNormalizado {
  id: string | null;
  posicion: number;
  tipo: PresupuestoItemDto['tipo'];
  catalogo_item_id: string | null;
  descripcion: string;
  proveedor: string | null;
  unidad: string;
  cantidad: string;
  precio_costo: string | null;
  precio_unitario: string;
}

/** Fila tal como la arma SQL_DOCUMENTO (antes de separar repuestos y trabajos). */
type DocumentoCrudo = Omit<
  PresupuestoDocumentoDto,
  | 'repuestos'
  | 'trabajos'
  | 'condiciones'
  | 'leyenda'
  | 'numeroFormateado'
  | 'taller'
> & {
  taller: PresupuestoDocumentoDto['taller'] & { textoCondiciones: string };
  items: Array<DocumentoItemDto & { tipo: string }>;
};

export function formatearNumero(numero: number): string {
  return String(numero).padStart(5, '0');
}

function fechaArgentina(isoFecha: string): string {
  const [anio, mes, dia] = isoFecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

@Injectable()
export class PresupuestosService {
  constructor(
    private readonly tenant: TenantService,
    private readonly users: UsersService,
  ) {}

  // -------------------------------------------------------------------------------
  //  Lectura
  // -------------------------------------------------------------------------------

  listar(
    tallerId: string,
    query: ListarPresupuestosQuery,
  ): Promise<PaginaPresupuestosDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    return this.tenant.run(tallerId, async (em) => {
      const valores: unknown[] = [];
      const condiciones: string[] = [];

      if (query.estado) {
        valores.push(query.estado);
        condiciones.push(`p.estado = $${valores.length}::estado_presupuesto`);
      }

      const texto = query.q?.trim();
      if (texto) {
        const alternativas: string[] = [];
        const numero = texto.replace(/^#/, '');
        if (/^\d{1,8}$/.test(numero)) {
          valores.push(Number(numero));
          alternativas.push(`p.numero = $${valores.length}`);
        }
        const patente = normalizarPatente(texto);
        if (patente.length >= 2) {
          valores.push(`%${escaparLike(patente)}%`);
          alternativas.push(`v.patente LIKE $${valores.length}`);
        }
        const patrones = patronesPorPalabra(texto);
        if (patrones.length > 0) {
          valores.push(patrones);
          alternativas.push(`c.busqueda LIKE ALL ($${valores.length}::text[])`);
        }
        if (alternativas.length > 0) {
          condiciones.push(`(${alternativas.join(' OR ')})`);
        }
      }

      valores.push(pageSize, (page - 1) * pageSize);
      const filas = await em.query<
        Array<
          Omit<PresupuestoResumenDto, 'numeroFormateado'> & {
            totalFilas: number;
          }
        >
      >(
        `SELECT p.id, p.numero, p.estado, p.fecha_emision AS "fechaEmision",
                (p.fecha_emision + p.validez_dias) AS "validoHasta", p.total::text AS total,
                v.patente, btrim(v.marca || ' ' || v.modelo) AS vehiculo,
                coalesce(c.razon_social, btrim(c.nombre || ' ' || coalesce(c.apellido, ''))) AS cliente,
                count(*) OVER ()::int AS "totalFilas"
           FROM presupuestos p
           JOIN vehiculos v ON v.taller_id = p.taller_id AND v.id = p.vehiculo_id
           JOIN clientes c ON c.taller_id = p.taller_id AND c.id = p.cliente_id
          ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
          ORDER BY p.fecha_emision DESC, p.numero DESC
          LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores,
      );

      return {
        items: filas.map(({ totalFilas: _total, ...fila }) => ({
          ...fila,
          numeroFormateado: formatearNumero(fila.numero),
        })),
        total: filas[0]?.totalFilas ?? 0,
        page,
        pageSize,
      };
    });
  }

  async obtener(tallerId: string, id: string): Promise<PresupuestoDetalleDto> {
    const detalle = await this.tenant.run(tallerId, (em) =>
      this.leerDetalle(em, id),
    );
    return this.conAutor(tallerId, detalle);
  }

  documento(tallerId: string, id: string): Promise<PresupuestoDocumentoDto> {
    return this.tenant.run(tallerId, (em) => this.documentoEn(em, id));
  }

  /** Enlace público para mandarle al cliente (se crea la primera vez que se pide). */
  enlace(tallerId: string, id: string): Promise<EnlacePublicoDto> {
    return this.tenant.run(tallerId, async (em) => {
      const [existe] = await em.query<Array<{ id: string }>>(
        `SELECT id FROM presupuestos WHERE id = $1`,
        [id],
      );
      if (!existe) {
        throw new NotFoundException('Presupuesto no encontrado.');
      }
      await em.query(
        `INSERT INTO presupuesto_enlaces (presupuesto_id, token) VALUES ($1, $2)
         ON CONFLICT (presupuesto_id) DO NOTHING`,
        [id, nuevaParteAleatoria()],
      );
      const [fila] = await em.query<
        Array<Omit<EnlacePublicoDto, 'token'> & { token: string }>
      >(
        `SELECT token, visto_en AS "vistoEn", ultima_vista_en AS "ultimaVistaEn", vistas
           FROM presupuesto_enlaces
          WHERE presupuesto_id = $1`,
        [id],
      );
      return { ...fila, token: armarTokenPublico(tallerId, fila.token) };
    });
  }

  /**
   * Hoja del presupuesto para el enlace público (sin usuario ni contraseña). El token trae
   * el taller: la consulta corre dentro de ese taller, con Row Level Security, como todas.
   * `contarVista` es false cuando lo abre alguien del propio taller.
   */
  documentoPublico(
    token: string,
    contarVista: boolean,
  ): Promise<PresupuestoDocumentoDto> {
    const datos = leerTokenPublico(token);
    if (!datos) {
      return Promise.reject(new NotFoundException(ENLACE_NO_DISPONIBLE));
    }
    return this.tenant.run(datos.tallerId, async (em) => {
      const [taller] = await em.query<Array<{ activo: boolean }>>(
        `SELECT activo FROM talleres WHERE id = $1`,
        [datos.tallerId],
      );
      if (!taller?.activo) {
        throw new NotFoundException(ENLACE_NO_DISPONIBLE);
      }
      const [enlace] = filasDe<{ presupuestoId: string }>(
        await em.query(
          contarVista
            ? `UPDATE presupuesto_enlaces
                  SET visto_en = coalesce(visto_en, now()), ultima_vista_en = now(),
                      vistas = vistas + 1
                WHERE token = $1
            RETURNING presupuesto_id AS "presupuestoId"`
            : `SELECT presupuesto_id AS "presupuestoId" FROM presupuesto_enlaces WHERE token = $1`,
          [datos.aleatorio],
        ),
      );
      if (!enlace) {
        throw new NotFoundException(ENLACE_NO_DISPONIBLE);
      }
      return this.documentoEn(em, enlace.presupuestoId);
    });
  }

  private async documentoEn(
    em: EntityManager,
    id: string,
  ): Promise<PresupuestoDocumentoDto> {
    const [fila] = await em.query<Array<{ dto: DocumentoCrudo }>>(
      SQL_DOCUMENTO,
      [id],
    );
    if (!fila) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }

    const { items, taller, ...resto } = fila.dto;
    const { textoCondiciones, ...datosTaller } = taller;
    const sinTipo = ({
      tipo: _tipo,
      ...item
    }: DocumentoItemDto & { tipo: string }) => item;

    return {
      ...resto,
      numeroFormateado: formatearNumero(resto.numero),
      taller: datosTaller,
      repuestos: items.filter((i) => i.tipo === 'repuesto').map(sinTipo),
      trabajos: items.filter((i) => i.tipo === 'trabajo').map(sinTipo),
      condiciones: textoCondiciones
        .replaceAll('{validez}', String(resto.validezDias))
        .replaceAll('{vencimiento}', fechaArgentina(resto.validoHasta)),
      leyenda: LEYENDA_DOCUMENTO,
    };
  }

  // -------------------------------------------------------------------------------
  //  Escritura
  // -------------------------------------------------------------------------------

  async crear(
    tallerId: string,
    usuarioId: string,
    dto: GuardarPresupuestoDto,
  ): Promise<PresupuestoDetalleDto> {
    const items = this.normalizarItems(dto.items, new Set());
    const detalle = await this.tenant.run(tallerId, async (em) => {
      await this.verificarVehiculoActivo(em, dto.vehiculoId);
      const clienteId =
        dto.clienteId ?? (await this.duenioDelVehiculo(em, dto.vehiculoId));
      const [fila] = await em.query<Array<{ id: string }>>(
        `INSERT INTO presupuestos
                (cliente_id, vehiculo_id, creado_por, fecha_emision, validez_dias, kilometraje,
                 motivo_ingreso, diagnostico, notas_cliente, notas_internas,
                 descuento_tipo, descuento_valor, iva_porcentaje)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [clienteId, dto.vehiculoId, usuarioId, ...this.valoresCabecera(dto)],
      );

      await this.escribirItems(em, fila.id, items);
      return this.leerDetalle(em, fila.id);
    });
    return this.conAutor(tallerId, detalle);
  }

  async actualizar(
    tallerId: string,
    id: string,
    dto: ActualizarPresupuestoDto,
  ): Promise<PresupuestoDetalleDto> {
    const detalle = await this.tenant.run(tallerId, async (em) => {
      const actual = await this.bloquear(em, id);
      if (!ESTADOS_EDITABLES.includes(actual.estado)) {
        throw new ConflictException(
          `El presupuesto está ${NOMBRES_ESTADO[actual.estado]} y ya no se puede modificar. ` +
            'Duplicalo para armar uno nuevo.',
        );
      }
      this.verificarVersion(actual.version, dto.version);
      if (dto.vehiculoId !== actual.vehiculoId) {
        await this.verificarVehiculoActivo(em, dto.vehiculoId);
      }

      const existentes = new Set(
        (
          await em.query<Array<{ id: string }>>(
            `SELECT id FROM presupuesto_items WHERE presupuesto_id = $1`,
            [id],
          )
        ).map((fila) => fila.id),
      );
      const items = this.normalizarItems(dto.items, existentes);
      const clienteId =
        dto.clienteId ?? (await this.duenioDelVehiculo(em, dto.vehiculoId));

      await em.query(
        `UPDATE presupuestos
            SET cliente_id = $2, vehiculo_id = $3,
                fecha_emision = coalesce($4, fecha_emision),
                validez_dias = coalesce($5, validez_dias),
                kilometraje = $6, motivo_ingreso = $7, diagnostico = $8,
                notas_cliente = $9, notas_internas = $10,
                descuento_tipo = $11, descuento_valor = $12,
                iva_porcentaje = coalesce($13, iva_porcentaje),
                version = version + 1
          WHERE id = $1`,
        [id, clienteId, dto.vehiculoId, ...this.valoresCabecera(dto)],
      );

      await this.escribirItems(em, id, items);
      return this.leerDetalle(em, id);
    });
    return this.conAutor(tallerId, detalle);
  }

  async cambiarEstado(
    tallerId: string,
    id: string,
    dto: CambiarEstadoDto,
  ): Promise<PresupuestoDetalleDto> {
    const detalle = await this.tenant.run(tallerId, async (em) => {
      const actual = await this.bloquear(em, id);
      if (dto.version !== undefined) {
        this.verificarVersion(actual.version, dto.version);
      }
      if (actual.estado !== dto.estado) {
        if (!TRANSICIONES_ESTADO[actual.estado].includes(dto.estado)) {
          throw new ConflictException(
            `No se puede pasar un presupuesto ${NOMBRES_ESTADO[actual.estado]} a ${NOMBRES_ESTADO[dto.estado]}.`,
          );
        }
        if (
          (dto.estado === 'enviado' || dto.estado === 'aprobado') &&
          actual.items === 0
        ) {
          throw new ConflictException(
            'Agregá al menos un ítem antes de enviarlo o aprobarlo.',
          );
        }
        await em.query(
          `UPDATE presupuestos SET estado = $2::estado_presupuesto, version = version + 1 WHERE id = $1`,
          [id, dto.estado],
        );
      }
      return this.leerDetalle(em, id);
    });
    return this.conAutor(tallerId, detalle);
  }

  /** Copia como borrador nuevo (con número nuevo y fecha de hoy) para el dueño actual del vehículo. */
  async duplicar(
    tallerId: string,
    usuarioId: string,
    id: string,
  ): Promise<PresupuestoDetalleDto> {
    const detalle = await this.tenant.run(tallerId, async (em) => {
      const [origen] = await em.query<Array<{ vehiculoId: string }>>(
        `SELECT vehiculo_id AS "vehiculoId" FROM presupuestos WHERE id = $1`,
        [id],
      );
      if (origen) {
        await this.verificarVehiculoActivo(em, origen.vehiculoId);
      }
      const [nuevo] = await em.query<Array<{ id: string }>>(
        `INSERT INTO presupuestos
                (cliente_id, vehiculo_id, creado_por, validez_dias, kilometraje, motivo_ingreso,
                 diagnostico, notas_cliente, notas_internas, descuento_tipo, descuento_valor,
                 iva_porcentaje)
         SELECT v.cliente_id, p.vehiculo_id, $2, p.validez_dias, p.kilometraje, p.motivo_ingreso,
                p.diagnostico, p.notas_cliente, p.notas_internas, p.descuento_tipo,
                p.descuento_valor, p.iva_porcentaje
           FROM presupuestos p
           JOIN vehiculos v ON v.taller_id = p.taller_id AND v.id = p.vehiculo_id
          WHERE p.id = $1
         RETURNING id`,
        [id, usuarioId],
      );
      if (!nuevo) {
        throw new NotFoundException('Presupuesto no encontrado.');
      }
      await em.query(
        `INSERT INTO presupuesto_items
                (presupuesto_id, posicion, tipo, catalogo_item_id, descripcion, proveedor, unidad,
                 cantidad, precio_costo, precio_unitario)
         SELECT $2, posicion, tipo, catalogo_item_id, descripcion, proveedor, unidad,
                cantidad, precio_costo, precio_unitario
           FROM presupuesto_items
          WHERE presupuesto_id = $1`,
        [id, nuevo.id],
      );
      return this.leerDetalle(em, nuevo.id);
    });
    return this.conAutor(tallerId, detalle);
  }

  /** Solo borradores. El número queda sin usar (un presupuesto no es un comprobante fiscal). */
  eliminar(tallerId: string, id: string): Promise<void> {
    return this.tenant.run(tallerId, async (em) => {
      const actual = await this.bloquear(em, id);
      if (actual.estado !== 'borrador') {
        throw new ConflictException(
          'Solo se pueden eliminar presupuestos en borrador.',
        );
      }
      await em.query(`DELETE FROM presupuestos WHERE id = $1`, [id]);
    });
  }

  // -------------------------------------------------------------------------------
  //  Internos
  // -------------------------------------------------------------------------------

  private async leerDetalle(
    em: EntityManager,
    id: string,
  ): Promise<PresupuestoDetalleDto> {
    const [fila] = await em.query<
      Array<{
        dto: Omit<
          PresupuestoDetalleDto,
          'numeroFormateado' | 'creadoPorNombre'
        >;
      }>
    >(SQL_DETALLE, [id]);
    if (!fila) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }
    return {
      ...fila.dto,
      numeroFormateado: formatearNumero(fila.dto.numero),
      creadoPorNombre: null,
    };
  }

  private async conAutor(
    tallerId: string,
    detalle: PresupuestoDetalleDto,
  ): Promise<PresupuestoDetalleDto> {
    if (!detalle.creadoPor) {
      return detalle;
    }
    const nombres = await this.users.nombresPorId(tallerId, [
      detalle.creadoPor,
    ]);
    return {
      ...detalle,
      creadoPorNombre: nombres.get(detalle.creadoPor) ?? null,
    };
  }

  /** Bloquea la fila (FOR UPDATE) para que dos ediciones simultáneas se serialicen. */
  private async bloquear(
    em: EntityManager,
    id: string,
  ): Promise<{
    estado: EstadoPresupuesto;
    version: number;
    items: number;
    vehiculoId: string;
  }> {
    const [fila] = await em.query<
      Array<{
        estado: EstadoPresupuesto;
        version: number;
        items: number;
        vehiculoId: string;
      }>
    >(
      `SELECT p.estado, p.version, p.vehiculo_id AS "vehiculoId",
              (SELECT count(*) FROM presupuesto_items i WHERE i.presupuesto_id = p.id)::int AS items
         FROM presupuestos p
        WHERE p.id = $1
          FOR UPDATE OF p`,
      [id],
    );
    if (!fila) {
      throw new NotFoundException('Presupuesto no encontrado.');
    }
    return fila;
  }

  private verificarVersion(actual: number, editada: number): void {
    if (actual !== editada) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'VERSION_CONFLICTO',
        message:
          'Otra persona guardó cambios en este presupuesto mientras lo editabas. ' +
          'Recargalo para ver la versión actual.',
      });
    }
  }

  /** Un vehículo dado de baja no recibe presupuestos nuevos (hay que darlo de alta antes). */
  private async verificarVehiculoActivo(
    em: EntityManager,
    vehiculoId: string,
  ): Promise<void> {
    const [fila] = await em.query<
      Array<{ patente: string; archivado: boolean }>
    >(
      `SELECT patente, archivado_en IS NOT NULL AS archivado FROM vehiculos WHERE id = $1`,
      [vehiculoId],
    );
    if (fila?.archivado) {
      throw new BadRequestException(
        `El vehículo ${fila.patente} está dado de baja. Volvé a darlo de alta para hacerle un presupuesto.`,
      );
    }
  }

  private async duenioDelVehiculo(
    em: EntityManager,
    vehiculoId: string,
  ): Promise<string> {
    const [fila] = await em.query<Array<{ cliente_id: string }>>(
      `SELECT cliente_id FROM vehiculos WHERE id = $1`,
      [vehiculoId],
    );
    if (!fila) {
      throw new BadRequestException('El vehículo no existe en este taller.');
    }
    return fila.cliente_id;
  }

  /** Parámetros $4..$13 compartidos por alta y edición. */
  private valoresCabecera(dto: GuardarPresupuestoDto): unknown[] {
    const descuentoTipo = dto.descuentoTipo ?? null;
    const descuentoValor = descuentoTipo ? (dto.descuentoValor ?? '0') : '0';
    return [
      dto.fechaEmision ?? null,
      dto.validezDias ?? null,
      dto.kilometraje ?? null,
      vacioANull(dto.motivoIngreso),
      vacioANull(dto.diagnostico),
      vacioANull(dto.notasCliente),
      vacioANull(dto.notasInternas),
      descuentoTipo,
      descuentoValor,
      dto.ivaPorcentaje ?? null,
    ];
  }

  /**
   * Posición = orden recibido. Los ids que no pertenecen a este presupuesto se descartan
   * (se insertan como ítems nuevos), así un id ajeno nunca pisa otra fila.
   */
  private normalizarItems(
    items: PresupuestoItemDto[],
    existentes: Set<string>,
  ): ItemNormalizado[] {
    return items.map((item, indice) => {
      const fila = indice + 1;
      const descripcion = item.descripcion.trim();
      if (!descripcion) {
        throw new BadRequestException(
          `Fila ${fila}: la descripción es obligatoria.`,
        );
      }
      if (Number(item.cantidad) <= 0) {
        throw new BadRequestException(
          `Fila ${fila}: la cantidad debe ser mayor que cero.`,
        );
      }
      return {
        id: item.id && existentes.has(item.id) ? item.id : null,
        posicion: fila,
        tipo: item.tipo,
        catalogo_item_id: item.catalogoItemId ?? null,
        descripcion,
        proveedor: vacioANull(item.proveedor),
        unidad: item.unidad ?? 'u',
        cantidad: item.cantidad,
        precio_costo: vacioANull(item.precioCosto),
        precio_unitario: item.precioUnitario,
      };
    });
  }

  /** Tres sentencias set-based (borrar, actualizar, insertar) sin importar la cantidad de ítems. */
  private async escribirItems(
    em: EntityManager,
    presupuestoId: string,
    items: ItemNormalizado[],
  ): Promise<void> {
    const json = JSON.stringify(items);
    await em.query(SQL_ITEMS_BORRAR, [presupuestoId, json]);
    await em.query(SQL_ITEMS_ACTUALIZAR, [presupuestoId, json]);
    await em.query(SQL_ITEMS_INSERTAR, [presupuestoId, json]);
  }
}
