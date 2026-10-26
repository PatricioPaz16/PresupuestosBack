import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
import { QueryBooleano } from '../../../common/decorators/query-booleano.decorator';
import {
  FILTROS_STOCK,
  type FiltroStock,
  REGEX_IMPORTE,
  REGEX_STOCK,
  TIPOS_ITEM,
  type TipoItem,
  UNIDADES,
  type Unidad,
} from '../../../common/constants/dominio.constant';

const MENSAJE_IMPORTE =
  'Importe inválido: usá punto decimal y hasta 2 decimales (ej: 12500.50).';
export const MENSAJE_STOCK =
  'Cantidad inválida: hasta 999999 con 3 decimales (ej: 4.5).';

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
  /** Repuestos: si lleva stock (se descuenta al aprobar presupuestos). */
  controlaStock: boolean;
  /** Cantidad en el taller ("12.000"). Puede ser negativa si se aprobó sin stock. */
  stock: string;
  /** Debajo de esto (o en esto) figura como faltante. */
  stockMinimo: string | null;
  ubicacion: string | null;
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

  @ApiPropertyOptional({
    default: false,
    description:
      'Solo repuestos. Al apagarlo, el stock que hubiera se lleva a cero con un ajuste.',
  })
  @IsOptional()
  @IsBoolean()
  controlaStock?: boolean;

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @Matches(REGEX_STOCK, { message: MENSAJE_STOCK })
  stockMinimo?: string | null;

  @ApiPropertyOptional({ example: 'Estante B3' })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'La ubicación admite hasta 60 caracteres.' })
  ubicacion?: string | null;
}

export class CrearCatalogoItemDto extends CatalogoItemInputDto {
  @ApiPropertyOptional({
    example: '5',
    description:
      'Repuestos: stock actual al darlo de alta. Si viene, activa el control de stock.',
  })
  @IsOptional()
  @Matches(REGEX_STOCK, { message: MENSAJE_STOCK })
  stockInicial?: string | null;
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
  @QueryBooleano()
  @IsBoolean()
  incluirInactivos?: boolean;

  @ApiPropertyOptional({
    enum: FILTROS_STOCK,
    description:
      'controlado: los que llevan stock · faltante: en o debajo del mínimo (o sin stock) · ' +
      'sin_control: repuestos que todavía no llevan stock · todos: sin filtrar. ' +
      'Con cualquiera de estos, ordena por nombre.',
  })
  @IsOptional()
  @IsIn(FILTROS_STOCK)
  stock?: FiltroStock;

  @ApiPropertyOptional({
    default: false,
    description: 'Solo precios de hace 45 días o más',
  })
  @IsOptional()
  @QueryBooleano()
  @IsBoolean()
  precioViejo?: boolean;

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
