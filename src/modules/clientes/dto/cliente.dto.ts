import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
  @ApiPropertyOptional({ description: 'Nombre, apellido o empresa' })
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
