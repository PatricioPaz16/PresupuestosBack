import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALICUOTAS_IVA,
  type Combustible,
  ESTADOS_PRESUPUESTO,
  type EstadoPresupuesto,
  REGEX_CANTIDAD,
  REGEX_IMPORTE,
  TIPOS_DESCUENTO,
  TIPOS_ITEM,
  type TipoDescuento,
  type TipoItem,
  UNIDADES,
  type Unidad,
} from '../../../common/constants/dominio.constant';
import type { ClienteDto } from '../../clientes/dto/cliente.dto';

const MENSAJE_IMPORTE =
  'Importe inválido: usá punto decimal y hasta 2 decimales (ej: 12500.50).';
const MENSAJE_CANTIDAD = 'Cantidad inválida: hasta 3 decimales (ej: 4.5).';

// ---------------------------------------------------------------------------------
//  Entrada
// ---------------------------------------------------------------------------------

export class PresupuestoItemDto {
  @ApiPropertyOptional({
    description: 'Id de un ítem existente (para conservarlo al editar)',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ enum: TIPOS_ITEM })
  @IsIn(TIPOS_ITEM, { message: 'El tipo de ítem debe ser repuesto o trabajo.' })
  tipo: TipoItem;

  @ApiPropertyOptional({
    description: 'Ítem de catálogo de origen. null = concepto libre',
  })
  @IsOptional()
  @IsUUID()
  catalogoItemId?: string | null;

  @ApiProperty({ example: 'Extremo de dirección derecho' })
  @IsString()
  @MaxLength(300, { message: 'La descripción admite hasta 300 caracteres.' })
  descripcion: string;

  @ApiPropertyOptional({
    description: 'INTERNO. Dónde se compró o cotizó. No se imprime.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  proveedor?: string | null;

  @ApiPropertyOptional({ enum: UNIDADES, default: 'u' })
  @IsOptional()
  @IsIn(UNIDADES)
  unidad?: Unidad;

  @ApiProperty({ example: '1' })
  @Matches(REGEX_CANTIDAD, { message: MENSAJE_CANTIDAD })
  cantidad: string;

  @ApiPropertyOptional({
    example: '30000.00',
    description: 'INTERNO. Costo unitario.',
  })
  @IsOptional()
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  precioCosto?: string | null;

  @ApiProperty({
    example: '45000.00',
    description: 'Precio unitario final al cliente (snapshot)',
  })
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  precioUnitario: string;
}

export class GuardarPresupuestoDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Elegí el vehículo del presupuesto.' })
  vehiculoId: string;

  @ApiPropertyOptional({
    description: 'Por defecto, el dueño actual del vehículo',
  })
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @ApiPropertyOptional({
    example: '2026-10-17',
    description: 'Por defecto, hoy en la zona horaria del taller',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD).' })
  fechaEmision?: string;

  @ApiPropertyOptional({
    description: 'Por defecto, la validez configurada en el taller',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validezDias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'El kilometraje debe ser un número entero.' })
  @Min(0)
  @Max(3000000)
  kilometraje?: number | null;

  @ApiPropertyOptional({ example: 'Ruido en tren delantero al pasar baches' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoIngreso?: string | null;

  @ApiPropertyOptional({ description: 'Lo que encontró el mecánico' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  diagnostico?: string | null;

  @ApiPropertyOptional({ description: 'Se imprime' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notasCliente?: string | null;

  @ApiPropertyOptional({ description: 'INTERNO. No se imprime' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notasInternas?: string | null;

  @ApiPropertyOptional({ enum: TIPOS_DESCUENTO, nullable: true })
  @IsOptional()
  @IsIn(TIPOS_DESCUENTO)
  descuentoTipo?: TipoDescuento | null;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @Matches(REGEX_IMPORTE, { message: MENSAJE_IMPORTE })
  descuentoValor?: string;

  @ApiPropertyOptional({
    enum: ALICUOTAS_IVA,
    description: '0 = precios finales',
  })
  @IsOptional()
  @IsIn(ALICUOTAS_IVA, { message: 'El IVA debe ser 0, 10.5 o 21.' })
  ivaPorcentaje?: number;

  @ApiProperty({ type: [PresupuestoItemDto] })
  @IsArray()
  @ArrayMaxSize(300, { message: 'Un presupuesto admite hasta 300 ítems.' })
  @ValidateNested({ each: true })
  @Type(() => PresupuestoItemDto)
  items: PresupuestoItemDto[];
}

export class ActualizarPresupuestoDto extends GuardarPresupuestoDto {
  @ApiProperty({
    description: 'Versión que se estaba editando (concurrencia optimista)',
  })
  @IsInt()
  @Min(1)
  version: number;
}

export class CambiarEstadoDto {
  @ApiProperty({ enum: ESTADOS_PRESUPUESTO })
  @IsIn(ESTADOS_PRESUPUESTO)
  estado: EstadoPresupuesto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ListarPresupuestosQuery {
  @ApiPropertyOptional({ enum: ESTADOS_PRESUPUESTO })
  @IsOptional()
  @IsIn(ESTADOS_PRESUPUESTO)
  estado?: EstadoPresupuesto;

  @ApiPropertyOptional({ description: 'Número, patente o cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

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

// ---------------------------------------------------------------------------------
//  Salida (los importes viajan como string decimal: "12345.67")
// ---------------------------------------------------------------------------------

export interface TotalesDto {
  subtotalRepuestos: string;
  subtotalTrabajos: string;
  descuentoMonto: string;
  ivaMonto: string;
  total: string;
}

export interface TotalesInternosDto extends TotalesDto {
  /** INTERNO: suma de costos cargados. */
  costoTotal: string;
}

export interface PresupuestoItemDetalleDto {
  id: string;
  tipo: TipoItem;
  catalogoItemId: string | null;
  descripcion: string;
  proveedor: string | null;
  unidad: Unidad;
  cantidad: string;
  precioCosto: string | null;
  precioUnitario: string;
  subtotal: string;
  /** Repuesto del catálogo que lleva stock: cuánto hay ahora. null si no lleva stock. */
  stock: { actual: string; unidad: Unidad } | null;
}

export interface VehiculoEnPresupuestoDto {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number | null;
  color: string | null;
  combustible: Combustible | null;
}

/** Vista interna completa (pantalla de armado). */
export interface PresupuestoDetalleDto {
  id: string;
  numero: number;
  numeroFormateado: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  validezDias: number;
  validoHasta: string;
  kilometraje: number | null;
  motivoIngreso: string | null;
  diagnostico: string | null;
  notasCliente: string | null;
  notasInternas: string | null;
  descuentoTipo: TipoDescuento | null;
  descuentoValor: string;
  ivaPorcentaje: string;
  totales: TotalesInternosDto;
  creadoPor: string | null;
  creadoPorNombre: string | null;
  enviadoEn: string | null;
  respondidoEn: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  cliente: ClienteDto;
  vehiculo: VehiculoEnPresupuestoDto;
  items: PresupuestoItemDetalleDto[];
  /** Enlace público: cuándo lo abrió el cliente. null si todavía no se generó. */
  enlace: Omit<EnlacePublicoDto, 'token'> | null;
  /** Repuestos que se descontaron del stock al aprobarlo. */
  stockDescontado: number;
}

export interface EnlacePublicoDto {
  /** Para armar el link: <dominio del front>/p/<token>. */
  token: string;
  /** Primera vez que lo abrió el cliente (las visitas del propio taller no cuentan). */
  vistoEn: string | null;
  ultimaVistaEn: string | null;
  vistas: number;
}

export interface PresupuestoResumenDto {
  id: string;
  numero: number;
  numeroFormateado: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  validoHasta: string;
  total: string;
  patente: string;
  vehiculo: string;
  cliente: string;
}

export interface PaginaPresupuestosDto {
  items: PresupuestoResumenDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocumentoItemDto {
  descripcion: string;
  unidad: Unidad;
  cantidad: string;
  precioUnitario: string;
  subtotal: string;
}

/**
 * Lo que necesita el PDF y NADA más: no incluye costos, proveedores, notas internas ni
 * datos de quién lo armó. "Ocultar" no depende del CSS: esos datos ni salen del servidor.
 */
export interface PresupuestoDocumentoDto {
  id: string;
  numero: number;
  numeroFormateado: string;
  estado: EstadoPresupuesto;
  fechaEmision: string;
  validezDias: number;
  validoHasta: string;
  kilometraje: number | null;
  motivoIngreso: string | null;
  diagnostico: string | null;
  notasCliente: string | null;
  descuentoTipo: TipoDescuento | null;
  descuentoValor: string;
  ivaPorcentaje: string;
  totales: TotalesDto;
  taller: {
    nombre: string;
    razonSocial: string | null;
    cuit: string | null;
    condicionIva: string;
    direccion: string | null;
    localidad: string | null;
    telefono: string | null;
    email: string | null;
    logoDataUrl: string | null;
  };
  cliente: {
    nombre: string;
    apellido: string | null;
    razonSocial: string | null;
    telefono: string | null;
    email: string | null;
    documento: string | null;
  };
  vehiculo: Omit<VehiculoEnPresupuestoDto, 'id'>;
  repuestos: DocumentoItemDto[];
  trabajos: DocumentoItemDto[];
  condiciones: string;
  leyenda: string;
}
