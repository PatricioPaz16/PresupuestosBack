import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { PresupuestoPdfService } from './pdf/presupuesto-pdf.service';
import { PresupuestosController } from './presupuestos.controller';
import { PresupuestosService } from './presupuestos.service';
import { PresupuestosPublicoController } from './publico/presupuestos-publico.controller';
import { SesionTallerService } from './publico/sesion-taller.service';

@Module({
  imports: [
    UsersModule,
    // Solo para reconocer la sesión del propio taller en el enlace público.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [PresupuestosController, PresupuestosPublicoController],
  providers: [PresupuestosService, PresupuestoPdfService, SesionTallerService],
})
export class PresupuestosModule {}
