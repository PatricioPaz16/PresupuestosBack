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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { CatalogoService } from './catalogo.service';
import {
  ActualizarCatalogoItemDto,
  AjustePreciosDto,
  BuscarCatalogoQuery,
  CatalogoItemDto,
  CrearCatalogoItemDto,
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
  @ApiOperation({
    summary:
      'Agregar un repuesto o trabajo (con stock inicial, si es un repuesto)',
  })
  crear(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Body() dto: CrearCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.catalogo.crear(tallerId, usuario.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar o activar/desactivar un ítem del catálogo' })
  actualizar(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarCatalogoItemDto,
  ): Promise<CatalogoItemDto> {
    return this.catalogo.actualizar(tallerId, usuario.id, id, dto);
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
