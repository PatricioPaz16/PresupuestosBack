import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { escaparLike, vacioANull } from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import {
  esPatenteValida,
  formatoPatente,
  normalizarPatente,
} from '../../common/normalizers/patente';
import { ClientesService } from '../clientes/clientes.service';
import {
  ActualizarVehiculoDto,
  BuscarPatenteResponseDto,
  CrearVehiculoDto,
  VehiculoDetalleDto,
  VehiculoInputDto,
  VehiculoResumenDto,
} from './dto/vehiculo.dto';

/** Vehículo + dueño actual + últimos 5 presupuestos, armado en una sola consulta. */
const SELECT_DETALLE = `
  SELECT json_build_object(
           'id', v.id, 'patente', v.patente, 'marca', v.marca, 'modelo', v.modelo,
           'version', v.version, 'anio', v.anio, 'color', v.color, 'combustible', v.combustible,
           'vin', v.vin, 'notas', v.notas,
           'cliente', json_build_object(
              'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido, 'razonSocial', c.razon_social,
              'telefono', c.telefono, 'email', c.email, 'documento', c.documento, 'notas', c.notas),
           'historial', coalesce((
              SELECT json_agg(h ORDER BY h."fechaEmision" DESC, h.numero DESC)
                FROM (SELECT p.id, p.numero, p.estado, p.fecha_emision AS "fechaEmision",
                             p.kilometraje, p.total::text AS total
                        FROM presupuestos p
                       WHERE p.vehiculo_id = v.id
                       ORDER BY p.fecha_emision DESC, p.numero DESC
                       LIMIT 5) h), '[]'::json),
           'ultimoKilometraje', (
              SELECT p.kilometraje FROM presupuestos p
               WHERE p.vehiculo_id = v.id AND p.kilometraje IS NOT NULL
               ORDER BY p.fecha_emision DESC, p.numero DESC LIMIT 1)
         ) AS dto
    FROM vehiculos v
    JOIN clientes c ON c.taller_id = v.taller_id AND c.id = v.cliente_id`;

@Injectable()
export class VehiculosService {
  constructor(
    private readonly tenant: TenantService,
    private readonly clientes: ClientesService,
  ) {}

  /** Busca por patente exacta y, si se escribió parte, devuelve coincidencias. */
  buscarPorPatente(
    tallerId: string,
    entrada: string,
  ): Promise<BuscarPatenteResponseDto> {
    const patente = normalizarPatente(entrada);
    return this.tenant.run(tallerId, async (em) => {
      const vehiculo = patente
        ? await this.leerPor(em, 'v.patente = $1', patente)
        : null;

      let coincidencias: VehiculoResumenDto[] = [];
      if (!vehiculo && patente.length >= 2) {
        coincidencias = await em.query<VehiculoResumenDto[]>(
          `SELECT v.id, v.patente, v.marca, v.modelo, v.anio,
                  btrim(c.nombre || ' ' || coalesce(c.apellido, '')) AS "clienteNombre"
             FROM vehiculos v
             JOIN clientes c ON c.taller_id = v.taller_id AND c.id = v.cliente_id
            WHERE v.archivado_en IS NULL AND v.patente LIKE $1
            ORDER BY (v.patente LIKE $2) DESC, v.patente
            LIMIT 6`,
          [`%${escaparLike(patente)}%`, `${escaparLike(patente)}%`],
        );
      }

      return {
        patente,
        formato: formatoPatente(patente),
        valida: esPatenteValida(patente),
        vehiculo,
        coincidencias,
      };
    });
  }

  obtener(tallerId: string, id: string): Promise<VehiculoDetalleDto> {
    return this.tenant.run(tallerId, async (em) => {
      const vehiculo = await this.leerPor(em, 'v.id = $1', id);
      if (!vehiculo) {
        throw new NotFoundException('Vehículo no encontrado.');
      }
      return vehiculo;
    });
  }

  /** Alta rápida: vehículo y (si hace falta) cliente nuevo, en una sola transacción. */
  crear(tallerId: string, dto: CrearVehiculoDto): Promise<VehiculoDetalleDto> {
    if (!dto.clienteId === !dto.cliente) {
      throw new BadRequestException(
        'Indicá un cliente existente (clienteId) o los datos de uno nuevo (cliente).',
      );
    }
    return this.tenant.run(tallerId, async (em) => {
      const clienteId =
        dto.clienteId ?? (await this.clientes.crearEn(em, dto.cliente!)).id;
      const datos = this.normalizar(dto);
      const [fila] = await em.query<Array<{ id: string }>>(
        `INSERT INTO vehiculos (cliente_id, patente, marca, modelo, version, anio, color, combustible, vin, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          clienteId,
          datos.patente,
          datos.marca,
          datos.modelo,
          datos.version,
          datos.anio,
          datos.color,
          datos.combustible,
          datos.vin,
          datos.notas,
        ],
      );
      return (await this.leerPor(em, 'v.id = $1', fila.id))!;
    });
  }

  actualizar(
    tallerId: string,
    id: string,
    dto: ActualizarVehiculoDto,
  ): Promise<VehiculoDetalleDto> {
    return this.tenant.run(tallerId, async (em) => {
      const actual = await this.leerPor(em, 'v.id = $1', id);
      if (!actual) {
        throw new NotFoundException('Vehículo no encontrado.');
      }
      const datos = this.normalizar({ ...actual, ...dto });
      await em.query(
        `UPDATE vehiculos
            SET cliente_id = $2, patente = $3, marca = $4, modelo = $5, version = $6, anio = $7,
                color = $8, combustible = $9, vin = $10, notas = $11
          WHERE id = $1`,
        [
          id,
          dto.clienteId ?? actual.cliente.id,
          datos.patente,
          datos.marca,
          datos.modelo,
          datos.version,
          datos.anio,
          datos.color,
          datos.combustible,
          datos.vin,
          datos.notas,
        ],
      );
      return (await this.leerPor(em, 'v.id = $1', id))!;
    });
  }

  private async leerPor(
    em: EntityManager,
    condicion: string,
    valor: string,
  ): Promise<VehiculoDetalleDto | null> {
    const [fila] = await em.query<
      Array<{ dto: Omit<VehiculoDetalleDto, 'formato'> }>
    >(`${SELECT_DETALLE} WHERE ${condicion}`, [valor]);
    return fila
      ? { ...fila.dto, formato: formatoPatente(fila.dto.patente) }
      : null;
  }

  private normalizar(dto: VehiculoInputDto) {
    const patente = normalizarPatente(dto.patente ?? '');
    if (!esPatenteValida(patente)) {
      throw new BadRequestException(
        'La patente debe tener entre 5 y 10 letras o números.',
      );
    }
    const marca = dto.marca?.trim();
    const modelo = dto.modelo?.trim();
    if (!marca || !modelo) {
      throw new BadRequestException('Marca y modelo son obligatorios.');
    }
    const vin =
      vacioANull(dto.vin)
        ?.toUpperCase()
        .replace(/[^A-Z0-9]/g, '') ?? null;
    return {
      patente,
      marca,
      modelo,
      version: vacioANull(dto.version),
      anio: dto.anio ?? null,
      color: vacioANull(dto.color),
      combustible: dto.combustible ?? null,
      vin: vin || null,
      notas: vacioANull(dto.notas),
    };
  }
}
