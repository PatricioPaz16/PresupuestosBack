import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants/roles.enum';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import {
  ActualizarVehiculoDto,
  BuscarPatenteQuery,
  BuscarPatenteResponseDto,
  CambiarDuenioDto,
  CrearVehiculoDto,
  VehiculoDetalleDto,
} from './dto/vehiculo.dto';
import { VehiculosService } from './vehiculos.service';

@ApiTags('vehiculos')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly vehiculos: VehiculosService) {}

  @Get('buscar')
  @ApiOperation({
    summary: 'Buscar por patente, cliente o teléfono',
    description:
      'Patente exacta: vehículo, dueño e historial (también si está dado de baja). Además, ' +
      'patentes parecidas y los clientes que coinciden por nombre, empresa, teléfono o ' +
      'documento, con sus autos. Sin texto: los últimos vehículos atendidos.',
  })
  buscar(
    @TallerId() tallerId: string,
    @Query() query: BuscarPatenteQuery,
  ): Promise<BuscarPatenteResponseDto> {
    return this.vehiculos.buscar(tallerId, query.q ?? query.patente ?? '');
  }

  @Get(':id')
  obtener(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.obtener(tallerId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Alta rápida de vehículo (con cliente existente o nuevo)',
  })
  crear(
    @TallerId() tallerId: string,
    @Body() dto: CrearVehiculoDto,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.crear(tallerId, dto);
  }

  @Patch(':id')
  actualizar(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarVehiculoDto,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.actualizar(tallerId, id, dto);
  }

  @Post(':id/baja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dar de baja un vehículo',
    description:
      'Deja de aparecer al buscar y en la ficha del cliente pasa a "dados de baja". ' +
      'Los presupuestos quedan. Se revierte con /alta.',
  })
  darDeBaja(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.darDeBaja(tallerId, id);
  }

  @Post(':id/alta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Volver a dar de alta un vehículo dado de baja' })
  darDeAlta(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.darDeAlta(tallerId, id);
  }

  @Patch(':id/duenio')
  @ApiOperation({
    summary: 'Cambiar el dueño (cliente existente o nuevo)',
    description:
      'Los presupuestos anteriores quedan a nombre de quien era el dueño en ese momento.',
  })
  cambiarDuenio(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarDuenioDto,
  ): Promise<VehiculoDetalleDto> {
    return this.vehiculos.cambiarDuenio(tallerId, id, dto);
  }
}
