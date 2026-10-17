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
import { ClientesService } from './clientes.service';
import {
  ActualizarClienteDto,
  BuscarClientesQuery,
  ClienteDto,
  ClienteInputDto,
} from './dto/cliente.dto';

@ApiTags('clientes')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar clientes por nombre/empresa o por teléfono',
  })
  buscar(
    @TallerId() tallerId: string,
    @Query() query: BuscarClientesQuery,
  ): Promise<ClienteDto[]> {
    return this.clientes.buscar(tallerId, query);
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
