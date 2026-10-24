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
import { ClientesService } from './clientes.service';
import {
  ActualizarClienteDto,
  BuscarClientesQuery,
  ClienteDto,
  ClienteFichaDto,
  ClienteInputDto,
  ClienteOpcionDto,
  ListarClientesQuery,
  PaginaClientesDto,
} from './dto/cliente.dto';

@ApiTags('clientes')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Clientes para elegir (desplegables)',
    description:
      'Por nombre, empresa, teléfono o documento. Sin texto, los últimos atendidos. ' +
      'Solo clientes activos, con las patentes de sus vehículos.',
  })
  buscar(
    @TallerId() tallerId: string,
    @Query() query: BuscarClientesQuery,
  ): Promise<ClienteOpcionDto[]> {
    return this.clientes.buscar(tallerId, query);
  }

  // Antes de ":id" para que "listado" no se tome como un id.
  @Get('listado')
  @ApiOperation({
    summary: 'Listado de clientes (pantalla Clientes)',
    description:
      'Búsqueda por nombre, teléfono, documento o patente; activos o dados de baja; paginado.',
  })
  listado(
    @TallerId() tallerId: string,
    @Query() query: ListarClientesQuery,
  ): Promise<PaginaClientesDto> {
    return this.clientes.listado(tallerId, query);
  }

  @Get(':id/ficha')
  @ApiOperation({
    summary:
      'Ficha del cliente: datos, vehículos (también los dados de baja) y presupuestos',
  })
  ficha(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteFichaDto> {
    return this.clientes.ficha(tallerId, id);
  }

  @Post(':id/baja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dar de baja al cliente y a sus vehículos activos',
    description:
      'Dejan de aparecer al buscar. Los presupuestos quedan. Se revierte con /alta.',
  })
  darDeBaja(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteFichaDto> {
    return this.clientes.darDeBaja(tallerId, id);
  }

  @Post(':id/alta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Volver a dar de alta al cliente (y los vehículos que se dieron de baja con él)',
  })
  darDeAlta(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteFichaDto> {
    return this.clientes.darDeAlta(tallerId, id);
  }

  @Get(':id')
  obtener(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClienteDto> {
    return this.clientes.obtener(tallerId, id);
  }

  @Post()
  crear(
    @TallerId() tallerId: string,
    @Body() dto: ClienteInputDto,
  ): Promise<ClienteDto> {
    return this.clientes.crear(tallerId, dto);
  }

  @Patch(':id')
  actualizar(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarClienteDto,
  ): Promise<ClienteDto> {
    return this.clientes.actualizar(tallerId, id, dto);
  }
}
