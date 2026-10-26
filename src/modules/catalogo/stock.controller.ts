import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { User } from '../users/entities/user.entity';
import type { CatalogoItemDto } from './dto/catalogo.dto';
import {
  AjusteStockDto,
  IngresoStockDto,
  MovimientosQuery,
  PaginaMovimientosDto,
  ResumenStockDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('catalogo')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('stock/resumen')
  @ApiOperation({
    summary: 'Totales del stock: faltantes, valor al costo y precios viejos',
  })
  resumen(@TallerId() tallerId: string): Promise<ResumenStockDto> {
    return this.stock.resumen(tallerId);
  }

  @Post(':id/stock/ingresos')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ingreso de mercadería: suma stock y puede actualizar costo y precio',
  })
  ingreso(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IngresoStockDto,
  ): Promise<CatalogoItemDto> {
    return this.stock.ingreso(tallerId, usuario.id, id, dto);
  }

  @Post(':id/stock/ajustes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Conteo: fija el stock real y registra la diferencia',
  })
  ajuste(
    @TallerId() tallerId: string,
    @CurrentUser() usuario: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AjusteStockDto,
  ): Promise<CatalogoItemDto> {
    return this.stock.ajuste(tallerId, usuario.id, id, dto);
  }

  @Get(':id/stock/movimientos')
  @ApiOperation({ summary: 'Historial de movimientos de stock de un repuesto' })
  movimientos(
    @TallerId() tallerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MovimientosQuery,
  ): Promise<PaginaMovimientosDto> {
    return this.stock.movimientos(tallerId, id, query);
  }
}
