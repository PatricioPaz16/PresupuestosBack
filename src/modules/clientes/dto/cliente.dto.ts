import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { QueryBooleano } from '../../../common/decorators/query-booleano.decorator';

export interface ClienteDto {
  id: string;
  nombre: string;
  apellido: string | null;
  razonSocial: string | null;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  notas: string | null;
}

/** Cliente en los desplegables: con las patentes de sus vehículos para distinguirlo. */
export interface ClienteOpcionDto extends ClienteDto {
  patentes: string[];
}

export interface VehiculoDeListadoDto {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
}

export interface ClienteListadoDto extends ClienteDto {
  archivadoEn: string | null;
  /** Vehículos activos. */
  vehiculos: VehiculoDeListadoDto[];
  vehiculosDeBaja: number;
  presupuestos: number;
  ultimoPresupuesto: string | null;
}

export interface PaginaClientesDto {
  items: ClienteListadoDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VehiculoDeFichaDto {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number | null;
  color: string | null;
  combustible: string | null;
  archivadoEn: string | null;
  /** Presupuestos del vehículo (con este u otros dueños). */
  presupuestos: number;
  ultimoPresupuesto: string | null;
}

export interface PresupuestoDeFichaDto {
  id: string;
  numero: number;
  numeroFormateado: string;
  estado: string;
  fechaEmision: string;
  validoHasta: string;
  total: string;
  patente: string;
  vehiculo: string;
}

/** Todo lo de un cliente para su pantalla: datos, vehículos (activos y dados de baja) y presupuestos. */
export interface ClienteFichaDto {
  cliente: ClienteDto & { archivadoEn: string | null; creadoEn: string };
  vehiculos: VehiculoDeFichaDto[];
  presupuestos: PresupuestoDeFichaDto[];
}

export class ClienteInputDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @Length(1, 80, {
    message: 'El nombre del cliente es obligatorio (hasta 80 caracteres).',
  })
  nombre: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  apellido?: string | null;

  @ApiPropertyOptional({ description: 'Empresa o flota' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  razonSocial?: string | null;

  @ApiPropertyOptional({
    example: '11 2345 6789',
    description: 'Se guarda como +5491123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_o, valor) => valor !== '')
  @IsEmail({}, { message: 'El email del cliente no es válido.' })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'DNI o CUIT (se guardan solo los dígitos)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string | null;

  @ApiPropertyOptional({ description: 'Notas internas, no se imprimen' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;
}

export class ActualizarClienteDto extends PartialType(ClienteInputDto) {}

export class BuscarClientesQuery {
  @ApiPropertyOptional({
    description:
      'Nombre, apellido, empresa, parte del teléfono o DNI/CUIT. Vacío: los últimos atendidos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Teléfono en cualquier formato (detección de duplicados)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListarClientesQuery {
  @ApiPropertyOptional({
    description: 'Nombre, apellido, empresa, teléfono, DNI/CUIT o patente',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'true: solo los dados de baja',
  })
  @IsOptional()
  @QueryBooleano()
  @IsBoolean()
  archivados?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
