import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  RoleName,
} from '../../common/constants/roles.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogoService } from './catalogo.service';
import {
  ActualizarCatalogoItemDto,
  AjustePreciosDto,
  BuscarCatalogoQuery,
  CatalogoItemDto,
  CatalogoItemInputDto,
  PaginaCatalogoDto,
} from './dto/catalogo.dto';

@ApiTags('catalogo')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('catalogo')
@UseGuards(RolesGuard)
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar repuestos y trabajos frecuentes (autocompletado)',
  })
  buscar(
    @TallerId() tallerId: string,
    @Query() query: BuscarCatalogoQuery,
  ): Promise<PaginaCatalogoDto> {
    return this.catalogo.buscar(tallerId, query);
  }

  @Post()
  crear(
    @TallerId() tallerId: string,
    @Body() dto: CatalogoItemInputDto,
  ): Promise<CatalogoItemDto> {
    return this.catalogo.crear(tallerId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar o activar/desactivar un ítem del catálogo' })
  actualizar(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.catalogo.actualizar(tallerId, id, dto);
  }

  @Post('ajuste-precios')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Ajuste masivo de precios por porcentaje (ADMIN)' })
  ajustarPrecios(
    @TallerId() tallerId: string,
    @Body() dto: AjustePreciosDto,
  ): Promise<{ actualizados: number }> {
    return this.catalogo.ajustarPrecios(tallerId, dto);
  }
}
