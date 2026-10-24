import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  escaparLike,
  patronesPorPalabra,
  vacioANull,
} from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import { normalizarPatente } from '../../common/normalizers/patente';
import {
  normalizarTelefono,
  TelefonoInvalidoError,
} from '../../common/normalizers/telefono';
import {
  ActualizarClienteDto,
  BuscarClientesQuery,
  ClienteDto,
  ClienteFichaDto,
  ClienteInputDto,
  ClienteListadoDto,
  ClienteOpcionDto,
  ListarClientesQuery,
  PaginaClientesDto,
  PresupuestoDeFichaDto,
  VehiculoDeFichaDto,
} from './dto/cliente.dto';

export const COLUMNAS_CLIENTE = `
  c.id, c.nombre, c.apellido, c.razon_social AS "razonSocial", c.telefono, c.email,
  c.documento, c.notas`;

type ClienteNormalizado = Omit<ClienteDto, 'id'>;

function telefonoONull(texto: string): string | null {
  try {
    return normalizarTelefono(texto);
  } catch {
    return null;
  }
}

/**
 * Condiciones (para unir con OR) que encuentran un cliente por lo escrito: todas las
 * palabras en nombre, apellido o empresa; o, con 4 dígitos o más, parte del teléfono o el
 * comienzo del DNI/CUIT. Agrega sus parámetros a `valores`. Usa el alias `c`.
 */
export function condicionesBusquedaCliente(
  texto: string,
  valores: unknown[],
): string[] {
  const condiciones: string[] = [];

  const patrones = patronesPorPalabra(texto);
  if (patrones.length > 0) {
    valores.push(patrones);
    condiciones.push(`c.busqueda LIKE ALL ($${valores.length}::text[])`);
  }

  const digitos = texto.replace(/\D/g, '');
  if (digitos.length >= 4) {
    valores.push(`%${digitos}%`);
    condiciones.push(
      `regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') LIKE $${valores.length}`,
    );
    valores.push(`${digitos}%`);
    condiciones.push(`c.documento LIKE $${valores.length}`);
    // Escrito completo con 0 o 15 ("0351 15 555-1234"): se compara ya normalizado.
    const telefono = telefonoONull(texto);
    if (telefono) {
      valores.push(telefono);
      condiciones.push(`c.telefono = $${valores.length}`);
    }
  }
  return condiciones;
}

/** Número de presupuesto como se muestra: 00042 (sin cortar los de más de 5 cifras). */
function numeroFormateado(numero: number): string {
  return String(numero).padStart(5, '0');
}

@Injectable()
export class ClientesService {
  constructor(private readonly tenant: TenantService) {}

  /**
   * Para los desplegables: por nombre, empresa, teléfono o documento (o teléfono exacto,
   * para detectar repetidos). Sin texto, los últimos clientes atendidos o cargados.
   */
  buscar(
    tallerId: string,
    query: BuscarClientesQuery,
  ): Promise<ClienteOpcionDto[]> {
    return this.tenant.run(tallerId, async (em) => {
      const condiciones: string[] = ['c.archivado_en IS NULL'];
      const valores: unknown[] = [];

      if (query.telefono) {
        const telefono = this.telefonoOError(query.telefono);
        valores.push(telefono);
        condiciones.push(`c.telefono = $${valores.length}`);
      }
      const texto = query.q?.trim() ?? '';
      if (texto) {
        const alternativas = condicionesBusquedaCliente(texto, valores);
        if (alternativas.length === 0) {
          return [];
        }
        condiciones.push(`(${alternativas.join(' OR ')})`);
      }
      const orden =
        texto || query.telefono
          ? 'c.nombre, c.apellido NULLS FIRST'
          : 'greatest(u.ultima, c.created_at) DESC';

      valores.push(query.limit ?? 10);
      return await em.query<ClienteOpcionDto[]>(
        `SELECT ${COLUMNAS_CLIENTE},
                coalesce((SELECT array_agg(v.patente ORDER BY v.created_at DESC)
                            FROM vehiculos v
                           WHERE v.taller_id = c.taller_id AND v.cliente_id = c.id
                             AND v.archivado_en IS NULL), '{}') AS patentes
           FROM clientes c
           LEFT JOIN LATERAL (
             SELECT max(p.created_at) AS ultima
               FROM presupuestos p
              WHERE p.taller_id = c.taller_id AND p.cliente_id = c.id) u ON true
          WHERE ${condiciones.join(' AND ')}
          ORDER BY ${orden}
          LIMIT $${valores.length}`,
        valores,
      );
    });
  }

  /** Pantalla de clientes: búsqueda (también por patente), activos o dados de baja, paginado. */
  listado(
    tallerId: string,
    query: ListarClientesQuery,
  ): Promise<PaginaClientesDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    return this.tenant.run(tallerId, async (em) => {
      const valores: unknown[] = [];
      const condiciones: string[] = [
        query.archivados
          ? 'c.archivado_en IS NOT NULL'
          : 'c.archivado_en IS NULL',
      ];

      const texto = query.q?.trim() ?? '';
      if (texto) {
        const alternativas = condicionesBusquedaCliente(texto, valores);
        const patente = normalizarPatente(texto);
        if (patente.length >= 2) {
          valores.push(`%${escaparLike(patente)}%`);
          alternativas.push(
            `EXISTS (SELECT 1 FROM vehiculos v
                      WHERE v.taller_id = c.taller_id AND v.cliente_id = c.id
                        AND v.patente LIKE $${valores.length})`,
          );
        }
        if (alternativas.length === 0) {
          return { items: [], total: 0, page, pageSize };
        }
        condiciones.push(`(${alternativas.join(' OR ')})`);
      }

      valores.push(pageSize, (page - 1) * pageSize);
      const filas = await em.query<
        Array<ClienteListadoDto & { totalFilas: number }>
      >(
        `SELECT ${COLUMNAS_CLIENTE}, c.archivado_en AS "archivadoEn",
                coalesce((SELECT json_agg(json_build_object(
                                   'id', v.id, 'patente', v.patente,
                                   'marca', v.marca, 'modelo', v.modelo)
                                 ORDER BY v.created_at DESC)
                            FROM vehiculos v
                           WHERE v.taller_id = c.taller_id AND v.cliente_id = c.id
                             AND v.archivado_en IS NULL), '[]'::json) AS vehiculos,
                (SELECT count(*)::int
                   FROM vehiculos v
                  WHERE v.taller_id = c.taller_id AND v.cliente_id = c.id
                    AND v.archivado_en IS NOT NULL) AS "vehiculosDeBaja",
                coalesce(u.cantidad, 0) AS presupuestos,
                u.ultimo AS "ultimoPresupuesto",
                count(*) OVER ()::int AS "totalFilas"
           FROM clientes c
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS cantidad, max(p.fecha_emision) AS ultimo
               FROM presupuestos p
              WHERE p.taller_id = c.taller_id AND p.cliente_id = c.id) u ON true
          WHERE ${condiciones.join(' AND ')}
          ORDER BY c.busqueda, c.id
          LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores,
      );

      return {
        items: filas.map(({ totalFilas: _total, ...cliente }) => cliente),
        total: filas[0]?.totalFilas ?? 0,
        page,
        pageSize,
      };
    });
  }

  ficha(tallerId: string, id: string): Promise<ClienteFichaDto> {
    return this.tenant.run(tallerId, (em) => this.fichaEn(em, id));
  }

  /**
   * Baja del cliente y de sus vehículos activos, con la misma marca de tiempo: así el alta
   * devuelve exactamente esos (no los que ya estaban dados de baja de antes).
   */
  darDeBaja(tallerId: string, id: string): Promise<ClienteFichaDto> {
    return this.tenant.run(tallerId, async (em) => {
      const estado = await this.bloquear(em, id);
      if (!estado.archivado) {
        await em.query(
          `UPDATE vehiculos SET archivado_en = now()
            WHERE cliente_id = $1 AND archivado_en IS NULL`,
          [id],
        );
        await em.query(
          `UPDATE clientes SET archivado_en = now() WHERE id = $1`,
          [id],
        );
      }
      return this.fichaEn(em, id);
    });
  }

  darDeAlta(tallerId: string, id: string): Promise<ClienteFichaDto> {
    return this.tenant.run(tallerId, async (em) => {
      const estado = await this.bloquear(em, id);
      if (estado.archivado) {
        // Primero los vehículos (se comparan con la marca del cliente, que todavía está).
        await em.query(
          `UPDATE vehiculos v SET archivado_en = NULL
             FROM clientes c
            WHERE c.id = $1 AND v.taller_id = c.taller_id AND v.cliente_id = c.id
              AND v.archivado_en = c.archivado_en`,
          [id],
        );
        await em.query(
          `UPDATE clientes SET archivado_en = NULL WHERE id = $1`,
          [id],
        );
      }
      return this.fichaEn(em, id);
    });
  }

  obtener(tallerId: string, id: string): Promise<ClienteDto> {
    return this.tenant.run(tallerId, (em) => this.leer(em, id));
  }

  crear(tallerId: string, dto: ClienteInputDto): Promise<ClienteDto> {
    return this.tenant.run(tallerId, (em) => this.crearEn(em, dto));
  }

  actualizar(
    tallerId: string,
    id: string,
    dto: ActualizarClienteDto,
  ): Promise<ClienteDto> {
    return this.tenant.run(tallerId, async (em) => {
      const actual = await this.leer(em, id);
      const datos = this.normalizar({ ...actual, ...dto });
      await em.query(
        `UPDATE clientes
            SET nombre = $2, apellido = $3, razon_social = $4, telefono = $5,
                email = $6, documento = $7, notas = $8
          WHERE id = $1`,
        [
          id,
          datos.nombre,
          datos.apellido,
          datos.razonSocial,
          datos.telefono,
          datos.email,
          datos.documento,
          datos.notas,
        ],
      );
      return this.leer(em, id);
    });
  }

  /** Alta dentro de una transacción ya abierta (la usa también el alta rápida de vehículos). */
  async crearEn(em: EntityManager, dto: ClienteInputDto): Promise<ClienteDto> {
    const datos = this.normalizar(dto);
    const [fila] = await em.query<Array<{ id: string }>>(
      `INSERT INTO clientes (nombre, apellido, razon_social, telefono, email, documento, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        datos.nombre,
        datos.apellido,
        datos.razonSocial,
        datos.telefono,
        datos.email,
        datos.documento,
        datos.notas,
      ],
    );
    return this.leer(em, fila.id);
  }

  /** Para operar sobre un cliente que tiene que estar activo (por ejemplo, nuevo dueño). */
  async leerActivo(em: EntityManager, id: string): Promise<ClienteDto> {
    const estado = await this.bloquear(em, id, false);
    if (estado.archivado) {
      throw new BadRequestException(
        'Ese cliente está dado de baja. Volvé a darlo de alta desde Clientes para usarlo.',
      );
    }
    return this.leer(em, id);
  }

  async leer(em: EntityManager, id: string): Promise<ClienteDto> {
    const [cliente] = await em.query<ClienteDto[]>(
      `SELECT ${COLUMNAS_CLIENTE} FROM clientes c WHERE c.id = $1`,
      [id],
    );
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return cliente;
  }

  private async fichaEn(
    em: EntityManager,
    id: string,
  ): Promise<ClienteFichaDto> {
    const [cliente] = await em.query<ClienteFichaDto['cliente'][]>(
      `SELECT ${COLUMNAS_CLIENTE}, c.archivado_en AS "archivadoEn", c.created_at AS "creadoEn"
         FROM clientes c
        WHERE c.id = $1`,
      [id],
    );
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    const vehiculos = await em.query<VehiculoDeFichaDto[]>(
      `SELECT v.id, v.patente, v.marca, v.modelo, v.version, v.anio, v.color,
              v.combustible::text AS combustible, v.archivado_en AS "archivadoEn",
              coalesce(u.cantidad, 0) AS presupuestos, u.ultimo AS "ultimoPresupuesto"
         FROM vehiculos v
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS cantidad, max(p.fecha_emision) AS ultimo
             FROM presupuestos p
            WHERE p.taller_id = v.taller_id AND p.vehiculo_id = v.id) u ON true
        WHERE v.cliente_id = $1
        ORDER BY (v.archivado_en IS NOT NULL), u.ultimo DESC NULLS LAST, v.created_at DESC`,
      [id],
    );

    const presupuestos = await em.query<
      Array<Omit<PresupuestoDeFichaDto, 'numeroFormateado'>>
    >(
      `SELECT p.id, p.numero, p.estado::text AS estado, p.fecha_emision AS "fechaEmision",
              (p.fecha_emision + p.validez_dias) AS "validoHasta", p.total::text AS total,
              v.patente, btrim(v.marca || ' ' || v.modelo) AS vehiculo
         FROM presupuestos p
         JOIN vehiculos v ON v.taller_id = p.taller_id AND v.id = p.vehiculo_id
        WHERE p.cliente_id = $1
        ORDER BY p.fecha_emision DESC, p.numero DESC
        LIMIT 50`,
      [id],
    );

    return {
      cliente,
      vehiculos,
      presupuestos: presupuestos.map((p) => ({
        ...p,
        numeroFormateado: numeroFormateado(p.numero),
      })),
    };
  }

  /** Bloquea la fila del cliente (para baja/alta) y dice si está dado de baja. */
  private async bloquear(
    em: EntityManager,
    id: string,
    paraActualizar = true,
  ): Promise<{ archivado: boolean }> {
    const [fila] = await em.query<Array<{ archivado: boolean }>>(
      `SELECT archivado_en IS NOT NULL AS archivado
         FROM clientes
        WHERE id = $1
        ${paraActualizar ? 'FOR UPDATE' : 'FOR SHARE'}`,
      [id],
    );
    if (!fila) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return fila;
  }

  private normalizar(dto: ClienteInputDto): ClienteNormalizado {
    const nombre = dto.nombre?.trim();
    if (!nombre) {
      throw new BadRequestException('El nombre del cliente es obligatorio.');
    }
    const documento = vacioANull(dto.documento)?.replace(/\D/g, '') || null;
    return {
      nombre,
      apellido: vacioANull(dto.apellido),
      razonSocial: vacioANull(dto.razonSocial),
      telefono: this.telefonoOError(dto.telefono),
      email: vacioANull(dto.email)?.toLowerCase() ?? null,
      documento,
      notas: vacioANull(dto.notas),
    };
  }

  private telefonoOError(valor: string | null | undefined): string | null {
    try {
      return normalizarTelefono(valor);
    } catch (error) {
      if (error instanceof TelefonoInvalidoError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
