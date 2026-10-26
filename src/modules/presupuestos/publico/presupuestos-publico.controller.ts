import {
  Controller,
  Get,
  Param,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PresupuestoDocumentoDto } from '../dto/presupuesto.dto';
import { PresupuestoPdfService } from '../pdf/presupuesto-pdf.service';
import { PresupuestosService } from '../presupuestos.service';
import { SesionTallerService } from './sesion-taller.service';

/**
 * Enlace público del presupuesto: lo abre el cliente desde WhatsApp, sin iniciar sesión.
 * Devuelve lo mismo que /presupuestos/:id/documento (nada interno). Límite de pedidos por
 * IP (el token igual es imposible de adivinar; el límite cuida el servidor).
 */
@ApiTags('publico')
@Public()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ login: true })
@Controller('publico/presupuestos')
export class PresupuestosPublicoController {
  constructor(
    private readonly presupuestos: PresupuestosService,
    private readonly pdf: PresupuestoPdfService,
    private readonly sesion: SesionTallerService,
  ) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Hoja del presupuesto para el cliente (enlace público)',
  })
  async documento(
    @Param('token') token: string,
    @Req() req: Request,
  ): Promise<PresupuestoDocumentoDto> {
    const delTaller = await this.sesion.esDelTaller(req, token);
    return this.presupuestos.documentoPublico(token, !delTaller);
  }

  @Get(':token/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'PDF del presupuesto para el cliente (enlace público)',
  })
  async archivo(@Param('token') token: string): Promise<StreamableFile> {
    // Bajar el PDF no suma otra "vista": ya se contó al abrir la página.
    const doc = await this.presupuestos.documentoPublico(token, false);
    const nombre = this.pdf.nombreArchivo(doc);
    return new StreamableFile(await this.pdf.generar(doc), {
      type: 'application/pdf',
      disposition: `inline; filename="${nombre}"`,
    });
  }
}
