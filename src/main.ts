import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // Detrás de Render/Vercel: para conocer la IP real del cliente (límite de intentos de
  // login por IP). Ver TRUST_PROXY en configuration.ts.
  const trustProxy = configService.get<boolean | number | string>(
    'trustProxy',
    false,
  );
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.use(helmet());
  // Las respuestas de la API son datos de un usuario: ningún proxy o CDN (Vercel) las
  // tiene que guardar en caché.
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
  // El logo del taller viaja como data URL (hasta ~400 KB): el límite por defecto es 100 KB.
  app.useBodyParser('json', {
    limit: configService.get<string>('bodyLimit', '1mb'),
  });

  app.enableCors({
    origin: configService.get<string>('frontendUrl'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-request-id'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  setupSwagger(app);

  const port = configService.get<number>('port', 3000);
  await app.listen(port);
}

void bootstrap();
