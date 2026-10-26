import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REGEX_IMPORTE,
  REGEX_STOCK,
  type TipoMovimientoStock,
} from '../../../common/constants/dominio.constant';
import { MENSAJE_STOCK } from './catalogo.dto';

const MENSAJE_IMPORTE =
  'Importe inválido: usá punto decimal y hasta 2 decimales (ej: 12500.50).';

/** Compra de mercadería: suma al stock y puede actualizar costo y precio de venta. */
export class IngresoStockDto {
  @ApiProperty({ example: '5' })
  @Matches(REGEX_STOCK, { message: MENSAJE_STOCK })
  cantidad: string;

  @ApiPropertyOptional({
    example: '9500.00',
    description:
      'Costo unitario de esta compra. Pasa a ser el costo del catálogo.',
  })
  @IsOptional()
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  costoUnitario?: string | null;

  @ApiPropertyOptional({
    example: '13500.00',
    description: 'Nuevo precio de venta (precio de referencia del catálogo).',
  })
  @IsOptional()
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  precioVenta?: string | null;

  @ApiPropertyOptional({ example: 'Repuestera Sur' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El proveedor admite hasta 120 caracteres.' })
  proveedor?: string | null;

  @ApiPropertyOptional({ example: 'FC A 0001-00012345' })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'El comprobante admite hasta 60 caracteres.' })
  comprobante?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La nota admite hasta 300 caracteres.' })
  nota?: string | null;
}

/** Conteo: se informa lo que hay realmente y se registra la diferencia. */
export class AjusteStockDto {
  @ApiProperty({
    example: '3',
    description: 'Stock contado (lo que hay en el taller)',
  })
  @Matches(REGEX_STOCK, { message: MENSAJE_STOCK })
  stockReal: string;

  @ApiPropertyOptional({ example: 'Conteo de fin de mes' })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La nota admite hasta 300 caracteres.' })
  nota?: string | null;
}

export class MovimientosQuery {
  @ApiPropertyOptional({ default: 50 })
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

export interface MovimientoStockDto {
  id: string;
  tipo: TipoMovimientoStock;
  /** Con signo: "5.000" entra, "-2.000" sale. */
  cantidad: string;
  stockResultante: string;
  costoUnitario: string | null;
  proveedor: string | null;
  comprobante: string | null;
  nota: string | null;
  fecha: string;
  presupuesto: { id: string; numero: number } | null;
  usuarioNombre: string | null;
}

export interface PaginaMovimientosDto {
  items: MovimientoStockDto[];
  total: number;
}

export interface ResumenStockDto {
  /** Repuestos activos que llevan stock. */
  repuestos: number;
  /** En el mínimo o debajo (sin mínimo: en cero o menos). */
  faltantes: number;
  /** Con stock negativo (se aprobó sin haber cargado el ingreso). */
  negativos: number;
  /** Stock positivo × costo del catálogo. */
  valorCosto: string;
  /** Stock positivo × precio de venta del catálogo. */
  valorVenta: string;
  /** Con stock y sin costo cargado: no suman al valor al costo. */
  sinCosto: number;
  /** Con precio de hace 45 días o más. */
  preciosViejos: number;
}
