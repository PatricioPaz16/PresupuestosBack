import {
  Body,
  Controller,
  Get,
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
    summary: 'Buscar por patente',
    description:
      'Si existe devuelve vehículo, dueño e historial; si no, coincidencias parciales.',
  })
  buscar(
    @TallerId() tallerId: string,
    @Query() query: BuscarPatenteQuery,
  ): Promise<BuscarPatenteResponseDto> {
    return this.vehiculos.buscarPorPatente(tallerId, query.patente);
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
}
