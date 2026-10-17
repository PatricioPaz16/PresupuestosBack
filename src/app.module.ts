import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { TenantModule } from './common/database/tenant.module';
import { PostgresExceptionFilter } from './common/filters/postgres-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { HealthModule } from './modules/health/health.module';
import { PresupuestosModule } from './modules/presupuestos/presupuestos.module';
import { TalleresModule } from './modules/talleres/talleres.module';
import { UsersModule } from './modules/users/users.module';
import { VehiculosModule } from './modules/vehiculos/vehiculos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('nodeEnv') === 'production';

        return {
          // Sintaxis de rutas de Express 5 (evita el aviso "Unsupported route path: /api/*").
          forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
          pinoHttp: {
            level: configService.get<string>('logging.level', 'info'),
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                },
            genReqId: (req, res) => {
              const headerId = req.headers['x-request-id'];
              const requestId =
                typeof headerId === 'string' ? headerId : randomUUID();
              res.setHeader('x-request-id', requestId);
              return requestId;
            },
          },
        };
      },
    }),
    DatabaseModule,
    TenantModule,
    SeedModule,
    AuthModule,
    UsersModule,
    HealthModule,
    TalleresModule,
    ClientesModule,
    VehiculosModule,
    CatalogoModule,
    PresupuestosModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: PostgresExceptionFilter,
    },
  ],
})
export class AppModule {}
