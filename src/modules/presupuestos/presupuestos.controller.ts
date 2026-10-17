import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { User } from '../users/entities/user.entity';
import {
  ActualizarPresupuestoDto,
  CambiarEstadoDto,
  GuardarPresupuestoDto,
  ListarPresupuestosQuery,
  PaginaPresupuestosDto,
  PresupuestoDetalleDto,
  PresupuestoDocumentoDto,
} from './dto/presupuesto.dto';
import { PresupuestosService } from './presupuestos.service';

@ApiTags('presupuestos')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('presupuestos')
export class PresupuestosController {
  constructor(private readonly presupuestos: PresupuestosService) {}

  @Get()
  @ApiOperation({
    summary: 'Listado con búsqueda por número, patente o cliente',
  })
  listar(
    @TallerId() tallerId: string,
    @Query() query: ListarPresupuestosQuery,
  ): Promise<PaginaPresupuestosDto> {
    return this.presupuestos.listar(tallerId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Presupuesto completo, con datos internos (costos, proveedor, notas)',
  })
  obtener(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PresupuestoDetalleDto> {
    return this.presupuestos.obtener(tallerId, id);
  }

  @Get(':id/documento')
  @ApiOperation({
    summary: 'Datos para imprimir / PDF. No incluye ningún dato interno.',
  })
  documento(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PresupuestoDocumentoDto> {
    return this.presupuestos.documento(tallerId, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crear presupuesto con sus ítems. Número, fecha y totales los asigna la base.',
  })
  crear(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Body() dto: GuardarPresupuestoDto,
  ): Promise<PresupuestoDetalleDto> {
    return this.presupuestos.crear(tallerId, usuario.id, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Guardar cambios. 409 si otra persona guardó antes (version).',
  })
  actualizar(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPresupuestoDto,
  ): Promise<PresupuestoDetalleDto> {
    return this.presupuestos.actualizar(tallerId, id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Cambiar estado (borrador, enviado, aprobado, rechazado)',
  })
  cambiarEstado(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
  ): Promise<PresupuestoDetalleDto> {
    return this.presupuestos.cambiarEstado(tallerId, id, dto);
  }

  @Post(':id/duplicar')
  @ApiOperation({ summary: 'Copiar como borrador nuevo' })
  duplicar(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PresupuestoDetalleDto> {
    return this.presupuestos.duplicar(tallerId, usuario.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar (solo borradores)' })
  eliminar(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.presupuestos.eliminar(tallerId, id);
  }
}
