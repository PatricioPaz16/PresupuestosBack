import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorPg {
  code?: string;
  constraint?: string;
  message?: string;
}

interface Traduccion {
  status: HttpStatus;
  message: string;
}

/** Mensajes para restricciones conocidas del esquema (nombre de constraint -> texto). */
const POR_RESTRICCION: Record<string, Traduccion> = {
  UQ_vehiculos_taller_patente: {
    status: HttpStatus.CONFLICT,
    message: 'Ya existe un vehículo con esa patente en el taller.',
  },
  UQ_catalogo_items_nombre: {
    status: HttpStatus.CONFLICT,
    message: 'Ya existe un ítem activo con ese nombre y marca en el catálogo.',
  },
  UQ_users_email: {
    status: HttpStatus.CONFLICT,
    message: 'Ya existe un usuario con ese email.',
  },
  FK_presupuesto_items_catalogo: {
    status: HttpStatus.CONFLICT,
    message:
      'El ítem de catálogo no existe o está usado en presupuestos (desactivalo en vez de borrarlo).',
  },
  FK_vehiculos_cliente: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El cliente indicado no existe.',
  },
  FK_presupuestos_cliente: {
    status: HttpStatus.CONFLICT,
    message: 'El cliente no existe o tiene presupuestos asociados.',
  },
  FK_presupuestos_vehiculo: {
    status: HttpStatus.CONFLICT,
    message: 'El vehículo no existe o tiene presupuestos asociados.',
  },
  CHK_clientes_telefono: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El teléfono no es válido.',
  },
  CHK_clientes_email: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El email no es válido.',
  },
  CHK_clientes_documento: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El DNI/CUIT debe tener entre 7 y 11 dígitos.',
  },
  CHK_vehiculos_patente: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La patente no es válida.',
  },
  CHK_vehiculos_vin: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El número de chasis (VIN) debe tener 17 caracteres.',
  },
  CHK_vehiculos_anio: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El año no es válido.',
  },
  CHK_presupuesto_items_cantidad: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La cantidad debe ser mayor que cero.',
  },
  CHK_presupuestos_desc_pct: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El descuento no puede superar el 100%.',
  },
  CHK_talleres_cuit: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El CUIT debe tener 11 dígitos.',
  },
  CHK_talleres_logo: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El logo debe ser PNG, JPG o WEBP de hasta 300 KB.',
  },
  CHK_catalogo_items_stock_tipo: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Solo los repuestos llevan stock.',
  },
  CHK_catalogo_items_stock: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El stock quedaría fuera de rango (hasta 999.999).',
  },
  CHK_catalogo_items_stock_movimientos: {
    status: HttpStatus.CONFLICT,
    message:
      'El stock cambia solo con movimientos: ingreso, conteo o presupuesto aprobado.',
  },
  CHK_stock_movimientos_ingreso: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La cantidad del ingreso tiene que ser mayor que cero.',
  },
  FK_stock_movimientos_item: {
    status: HttpStatus.NOT_FOUND,
    message: 'El repuesto no existe en el catálogo.',
  },
  FK_stock_movimientos_presupuesto: {
    status: HttpStatus.CONFLICT,
    message: 'El presupuesto movió stock y no se puede borrar.',
  },
};

/** Traduce errores de PostgreSQL a respuestas HTTP con mensajes para el usuario. */
@Catch(QueryFailedError)
export class PostgresExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = (exception.driverError ?? {}) as ErrorPg;
    const traduccion = this.traducir(error);

    if (traduccion.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(traduccion.status).json({
      statusCode: traduccion.status,
      message: traduccion.message,
      error: HttpStatus[traduccion.status],
    });
  }

  private traducir(error: ErrorPg): Traduccion {
    const porRestriccion = error.constraint
      ? POR_RESTRICCION[error.constraint]
      : undefined;
    if (porRestriccion) {
      return porRestriccion;
    }

    switch (error.code) {
      case '23505':
        return {
          status: HttpStatus.CONFLICT,
          message: 'El registro ya existe.',
        };
      case '23503':
        return {
          status: HttpStatus.CONFLICT,
          message: 'El registro está relacionado con otros datos.',
        };
      case '23514':
      case '23502':
      case '22001':
      case '22003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Hay datos inválidos en la solicitud.',
        };
      case '22P02':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Identificador o valor con formato inválido.',
        };
      case '42501':
        return {
          status: HttpStatus.FORBIDDEN,
          message: 'Operación no permitida para este taller.',
        };
      case '40001':
      case '40P01':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Otro usuario modificó los mismos datos. Volvé a intentar.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error interno de base de datos.',
        };
    }
  }
}
