import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { vacioANull } from '../../common/database/sql.util';
import { TenantService } from '../../common/database/tenant.service';
import { RoleName } from '../../common/constants/roles.enum';
import { ActualizarTallerDto, TallerConfigDto } from './dto/taller.dto';

const SELECT_CONFIG = `
  SELECT t.id, t.nombre, t.razon_social AS "razonSocial", t.cuit,
         t.condicion_iva AS "condicionIva", t.direccion, t.localidad, t.telefono, t.email,
         t.logo_data_url AS "logoDataUrl", t.zona_horaria AS "zonaHoraria",
         t.validez_dias_default AS "validezDiasDefault",
         t.iva_porcentaje_default::text AS "ivaPorcentajeDefault",
         t.recargo_sugerido_porcentaje::text AS "recargoSugeridoPorcentaje",
         t.texto_condiciones AS "textoCondiciones",
         coalesce((SELECT n.ultimo_valor FROM numeradores n WHERE n.entidad = 'presupuesto'), 0) + 1
           AS "proximoNumero"
    FROM talleres t
   WHERE t.id = $1`;

export interface CrearTallerInput {
  nombre: string;
  adminEmail: string;
  adminNombre: string;
  adminPassword: string;
}

@Injectable()
export class TalleresService {
  constructor(
    private readonly tenant: TenantService,
    private readonly dataSource: DataSource,
  ) {}

  obtenerConfig(tallerId: string): Promise<TallerConfigDto> {
    return this.tenant.run(tallerId, (em) => this.leerConfig(em, tallerId));
  }

  actualizarConfig(
    tallerId: string,
    dto: ActualizarTallerDto,
  ): Promise<TallerConfigDto> {
    return this.tenant.run(tallerId, async (em) => {
      const columnas: Record<
        keyof Omit<ActualizarTallerDto, 'proximoNumero'>,
        string
      > = {
        nombre: 'nombre',
        razonSocial: 'razon_social',
        cuit: 'cuit',
        condicionIva: 'condicion_iva',
        direccion: 'direccion',
        localidad: 'localidad',
        telefono: 'telefono',
        email: 'email',
        logoDataUrl: 'logo_data_url',
        validezDiasDefault: 'validez_dias_default',
        ivaPorcentajeDefault: 'iva_porcentaje_default',
        recargoSugeridoPorcentaje: 'recargo_sugerido_porcentaje',
        textoCondiciones: 'texto_condiciones',
      };

      const sets: string[] = [];
      const valores: unknown[] = [tallerId];
      for (const [campo, columna] of Object.entries(columnas)) {
        const valor = dto[campo as keyof ActualizarTallerDto];
        if (valor === undefined) continue;
        let normalizado: unknown =
          typeof valor === 'string' ? vacioANull(valor) : valor;
        if (campo === 'cuit' && typeof normalizado === 'string') {
          normalizado = normalizado.replace(/\D/g, '');
        }
        if (campo === 'nombre' || campo === 'textoCondiciones') {
          if (normalizado === null) {
            throw new BadRequestException(
              `El campo ${campo} no puede quedar vacío.`,
            );
          }
        }
        valores.push(normalizado);
        sets.push(`${columna} = $${valores.length}`);
      }

      if (sets.length > 0) {
        await em.query(
          `UPDATE talleres SET ${sets.join(', ')} WHERE id = $1`,
          valores,
        );
      }

      if (dto.proximoNumero !== undefined) {
        await this.fijarProximoNumero(em, tallerId, dto.proximoNumero);
      }

      return this.leerConfig(em, tallerId);
    });
  }

  /**
   * Alta de un taller con su primer administrador (lo usa el comando `npm run taller:crear`).
   * Corre fuera del contexto de un taller: es una operación de plataforma.
   */
  async crearConAdmin(
    input: CrearTallerInput,
  ): Promise<{ tallerId: string; usuarioId: string }> {
    const email = input.adminEmail.trim().toLowerCase();
    return this.dataSource.transaction(async (em) => {
      const existe = await em.query<unknown[]>(
        `SELECT 1 FROM users WHERE email = $1`,
        [email],
      );
      if (existe.length > 0) {
        throw new ConflictException(
          `Ya existe un usuario con el email ${email}.`,
        );
      }

      const [taller] = await em.query<Array<{ id: string }>>(
        `INSERT INTO talleres (nombre) VALUES ($1) RETURNING id`,
        [input.nombre.trim()],
      );

      const [rol] = await em.query<Array<{ id: number }>>(
        `SELECT id FROM roles WHERE name = $1`,
        [RoleName.ADMIN],
      );
      if (!rol) {
        throw new NotFoundException(
          'No existe el rol ADMIN: iniciá la API una vez para correr el seed.',
        );
      }

      const [usuario] = await em.query<Array<{ id: string }>>(
        `INSERT INTO users (email, password, full_name, role_id, taller_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          email,
          await bcrypt.hash(input.adminPassword, 12),
          input.adminNombre.trim(),
          rol.id,
          taller.id,
        ],
      );

      return { tallerId: taller.id, usuarioId: usuario.id };
    });
  }

  private async leerConfig(
    em: EntityManager,
    tallerId: string,
  ): Promise<TallerConfigDto> {
    const [config] = await em.query<TallerConfigDto[]>(SELECT_CONFIG, [
      tallerId,
    ]);
    if (!config) {
      throw new NotFoundException('Taller no encontrado.');
    }
    return config;
  }

  private async fijarProximoNumero(
    em: EntityManager,
    tallerId: string,
    proximo: number,
  ): Promise<void> {
    const [{ maximo }] = await em.query<Array<{ maximo: number }>>(
      `SELECT coalesce(max(numero), 0) AS maximo FROM presupuestos`,
    );
    if (proximo <= maximo) {
      throw new BadRequestException(
        `El próximo número tiene que ser mayor que el último usado (${maximo}).`,
      );
    }
    await em.query(
      `INSERT INTO numeradores (taller_id, entidad, ultimo_valor) VALUES ($1, 'presupuesto', $2)
       ON CONFLICT (taller_id, entidad) DO UPDATE SET ultimo_valor = EXCLUDED.ultimo_valor`,
      [tallerId, proximo - 1],
    );
  }
}
