import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
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
  ValidateIf,
} from 'class-validator';
import {
  ALICUOTAS_IVA,
  CONDICIONES_IVA,
  type CondicionIva,
} from '../../../common/constants/dominio.constant';

export interface TallerConfigDto {
  id: string;
  nombre: string;
  razonSocial: string | null;
  cuit: string | null;
  condicionIva: CondicionIva;
  direccion: string | null;
  localidad: string | null;
  telefono: string | null;
  email: string | null;
  logoDataUrl: string | null;
  zonaHoraria: string;
  validezDiasDefault: number;
  ivaPorcentajeDefault: string;
  recargoSugeridoPorcentaje: string;
  textoCondiciones: string;
  proximoNumero: number;
}

/** PATCH /taller. null borra un dato opcional; un campo ausente no se toca. */
export class ActualizarTallerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120, {
    message: 'El nombre del taller es obligatorio (hasta 120 caracteres).',
  })
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  razonSocial?: string | null;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @Matches(/^\d{2}-?\d{8}-?\d$/, { message: 'El CUIT debe tener 11 dígitos.' })
  cuit?: string | null;

  @ApiPropertyOptional({ enum: CONDICIONES_IVA })
  @IsOptional()
  @IsIn(CONDICIONES_IVA)
  condicionIva?: CondicionIva;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  direccion?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  localidad?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsEmail({}, { message: 'El email del taller no es válido.' })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'data:image/png;base64,... (hasta 300 KB)',
  })
  @IsOptional()
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: 'El logo debe ser una imagen PNG, JPG o WEBP.',
  })
  @MaxLength(400000, { message: 'El logo no puede superar los 300 KB.' })
  logoDataUrl?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  validezDiasDefault?: number;

  @ApiPropertyOptional({ enum: ALICUOTAS_IVA })
  @IsOptional()
  @IsIn(ALICUOTAS_IVA, { message: 'El IVA debe ser 0, 10.5 o 21.' })
  ivaPorcentajeDefault?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(500)
  recargoSugeridoPorcentaje?: number;

  @ApiPropertyOptional({ description: 'Admite {validez} y {vencimiento}' })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  textoCondiciones?: string;

  @ApiPropertyOptional({ description: 'Número del próximo presupuesto' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99999999)
  proximoNumero?: number;
}
