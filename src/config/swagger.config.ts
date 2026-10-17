import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../common/constants/roles.enum';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Presupuestos de Taller API')
    .setDescription(
      'API con autenticación basada en cookies HttpOnly. ' +
        'El JWT de acceso viaja en la cookie `access_token` (no en Authorization Bearer). ' +
        'El refresh token viaja en `refresh_token` con path `/api/auth`. ' +
        'Todo endpoint de negocio opera dentro del taller del usuario autenticado.',
    )
    .setVersion('1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      name: ACCESS_TOKEN_COOKIE,
      description: 'JWT de acceso (HttpOnly)',
    })
    .addCookieAuth(REFRESH_TOKEN_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      name: REFRESH_TOKEN_COOKIE,
      description: 'Refresh token rotativo (HttpOnly, path /api/auth)',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
