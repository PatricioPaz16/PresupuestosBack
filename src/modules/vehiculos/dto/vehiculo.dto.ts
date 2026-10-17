import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  COMBUSTIBLES,
  type Combustible,
  type EstadoPresupuesto,
} from '../../../common/constants/dominio.constant';
import type { FormatoPatente } from '../../../common/normalizers/patente';
import { ClienteDto, ClienteInputDto } from '../../clientes/dto/cliente.dto';

export interface HistorialItemDto {
  id: string;
  numero: number;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  kilometraje: number | null;
  total: string;
}

export interface VehiculoDetalleDto {
  id: string;
  patente: string;
  formato: FormatoPatente;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number | null;
  color: string | null;
  combustible: Combustible | null;
  vin: string | null;
  notas: string | null;
  cliente: ClienteDto;
  historial: HistorialItemDto[];
  ultimoKilometraje: number | null;
}

export interface VehiculoResumenDto {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number | null;
  clienteNombre: string;
}

export interface BuscarPatenteResponseDto {
  /** Patente normalizada (AB123CD). */
  patente: string;
  formato: FormatoPatente;
  valida: boolean;
  vehiculo: VehiculoDetalleDto | null;
  /** Coincidencias parciales (si se escribió parte de la patente). */
  coincidencias: VehiculoResumenDto[];
}

export class VehiculoInputDto {
  @ApiProperty({ example: 'AB 123 CD', description: 'Se normaliza a AB123CD' })
  @IsString()
  @Length(5, 16, { message: 'La patente debe tener entre 5 y 10 caracteres.' })
  patente: string;

  @ApiProperty({ example: 'Volkswagen' })
  @IsString()
  @Length(1, 60, { message: 'La marca es obligatoria.' })
  marca: string;

  @ApiProperty({ example: 'Gol Trend' })
  @IsString()
  @Length(1, 80, { message: 'El modelo es obligatorio.' })
  modelo: string;

  @ApiPropertyOptional({ example: '1.6 MSI', description: 'Versión / motor' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @ApiPropertyOptional({ example: 2015 })
  @IsOptional()
  @IsInt({ message: 'El año debe ser un número.' })
  @Min(1900)
  @Max(2100)
  anio?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @ApiPropertyOptional({ enum: COMBUSTIBLES })
  @IsOptional()
  @IsIn(COMBUSTIBLES)
  combustible?: Combustible | null;

  @ApiPropertyOptional({ description: 'Número de chasis (17 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vin?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string | null;
}

/** Alta rápida: el vehículo con un cliente existente (clienteId) o uno nuevo (cliente). */
export class CrearVehiculoDto extends VehiculoInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'clienteId inválido.' })
  clienteId?: string;

  @ApiPropertyOptional({ type: ClienteInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteInputDto)
  cliente?: ClienteInputDto;
}

export class ActualizarVehiculoDto extends PartialType(VehiculoInputDto) {
  @ApiPropertyOptional({ description: 'Cambio de dueño' })
  @IsOptional()
  @IsUUID('all', { message: 'clienteId inválido.' })
  clienteId?: string;
}

export class BuscarPatenteQuery {
  @ApiProperty({ example: 'AB123CD' })
  @IsString()
  @Length(1, 16)
  patente: string;
}
