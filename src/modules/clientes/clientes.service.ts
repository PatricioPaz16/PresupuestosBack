import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { patronesPorPalabra, vacioANull } from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import {
  normalizarTelefono,
  TelefonoInvalidoError,
} from '../../common/normalizers/telefono';
import {
  ActualizarClienteDto,
  BuscarClientesQuery,
  ClienteDto,
  ClienteInputDto,
} from './dto/cliente.dto';

export const COLUMNAS_CLIENTE = `
  c.id, c.nombre, c.apellido, c.razon_social AS "razonSocial", c.telefono, c.email,
  c.documento, c.notas`;

type ClienteNormalizado = Omit<ClienteDto, 'id'>;

@Injectable()
export class ClientesService {
  constructor(private readonly tenant: TenantService) {}

  buscar(tallerId: string, query: BuscarClientesQuery): Promise<ClienteDto[]> {
    return this.tenant.run(tallerId, async (em) => {
      const condiciones: string[] = ['c.archivado_en IS NULL'];
      const valores: unknown[] = [];

      if (query.telefono) {
        const telefono = this.telefonoOError(query.telefono);
        valores.push(telefono);
        condiciones.push(`c.telefono = $${valores.length}`);
      }
      const patrones = query.q ? patronesPorPalabra(query.q) : [];
      if (patrones.length > 0) {
        valores.push(patrones);
        condiciones.push(`c.busqueda LIKE ALL ($${valores.length}::text[])`);
      }

      valores.push(query.limit ?? 10);
      return await em.query<ClienteDto[]>(
        `SELECT ${COLUMNAS_CLIENTE}
           FROM clientes c
          WHERE ${condiciones.join(' AND ')}
          ORDER BY c.nombre, c.apellido NULLS FIRST
          LIMIT $${valores.length}`,
        valores,
      );
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
