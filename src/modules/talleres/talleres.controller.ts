import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  RoleName,
} from '../../common/constants/roles.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActualizarTallerDto, TallerConfigDto } from './dto/taller.dto';
import { TalleresService } from './talleres.service';

@ApiTags('taller')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('taller')
@UseGuards(RolesGuard)
export class TalleresController {
  constructor(private readonly talleres: TalleresService) {}

  @Get()
  @ApiOperation({ summary: 'Datos y configuración del taller del usuario' })
  obtener(@TallerId() tallerId: string): Promise<TallerConfigDto> {
    return this.talleres.obtenerConfig(tallerId);
  }

  @Patch()
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Actualizar datos, logo, valores por defecto y numeración (ADMIN)',
  })
  actualizar(
    @TallerId() tallerId: string,
    @Body() dto: ActualizarTallerDto,
  ): Promise<TallerConfigDto> {
    return this.talleres.actualizarConfig(tallerId, dto);
  }
}
