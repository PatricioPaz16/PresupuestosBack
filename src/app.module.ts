import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

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
    SeedModule,
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
