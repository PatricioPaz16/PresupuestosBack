import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REGEX_IMPORTE,
  TIPOS_ITEM,
  type TipoItem,
  UNIDADES,
  type Unidad,
} from '../../../common/constants/dominio.constant';

const MENSAJE_IMPORTE =
  'Importe inválido: usá punto decimal y hasta 2 decimales (ej: 12500.50).';

export interface CatalogoItemDto {
  id: string;
  tipo: TipoItem;
  nombre: string;
  marca: string | null;
  codigo: string | null;
  unidad: Unidad;
  precioReferencia: string;
  costoReferencia: string | null;
  precioActualizadoEn: string;
  vecesUsado: number;
  activo: boolean;
}

export interface PaginaCatalogoDto {
  items: CatalogoItemDto[];
  total: number;
}

export class CatalogoItemInputDto {
  @ApiProperty({ enum: TIPOS_ITEM })
  @IsIn(TIPOS_ITEM, { message: 'El tipo debe ser repuesto o trabajo.' })
  tipo: TipoItem;

  @ApiProperty({ example: 'Filtro de aceite' })
  @IsString()
  @Length(1, 200, {
    message: 'El nombre es obligatorio (hasta 200 caracteres).',
  })
  nombre: string;

  @ApiPropertyOptional({ example: 'Fram' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string | null;

  @ApiPropertyOptional({ example: 'PH5949' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigo?: string | null;

  @ApiPropertyOptional({ enum: UNIDADES, default: 'u' })
  @IsOptional()
  @IsIn(UNIDADES)
  unidad?: Unidad;

  @ApiProperty({ example: '12500.00' })
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  precioReferencia: string;

  @ApiPropertyOptional({ example: '9000.00' })
  @IsOptional()
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  costoReferencia?: string | null;
}

export class ActualizarCatalogoItemDto extends PartialType(
  CatalogoItemInputDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class BuscarCatalogoQuery {
  @ApiPropertyOptional({ enum: TIPOS_ITEM })
  @IsOptional()
  @IsIn(TIPOS_ITEM)
  tipo?: TipoItem;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirInactivos?: boolean;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Ajuste masivo por inflación: +8% a todos los repuestos, redondeando a $100. */
export class AjustePreciosDto {
  @ApiPropertyOptional({
    enum: TIPOS_ITEM,
    description: 'Vacío = repuestos y trabajos',
  })
  @IsOptional()
  @IsIn(TIPOS_ITEM)
  tipo?: TipoItem;

  @ApiProperty({ example: 8, description: 'Porcentaje (negativo para bajar)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-90)
  @Max(500)
  porcentaje: number;

  @ApiPropertyOptional({
    enum: [0, 10, 100, 1000],
    default: 0,
    description: 'Redondear a $10, $100 o $1000',
  })
  @IsOptional()
  @IsIn([0, 10, 100, 1000])
  redondeo?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Aplicar también al costo de referencia',
  })
  @IsOptional()
  @IsBoolean()
  incluirCosto?: boolean;
}
