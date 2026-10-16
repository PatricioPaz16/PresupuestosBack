import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

function mergeSetCookie(
  setCookie: string[] | string | undefined,
): string | undefined {
  if (!setCookie) {
    return undefined;
  }

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login → me → refresh → logout', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
      })
      .expect(200);

    expect(loginResponse.body).toMatchObject({
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    });
    expect(loginResponse.body).not.toHaveProperty('access_token');
    expect(loginResponse.body).not.toHaveProperty('password');

    const sessionCookies = mergeSetCookie(loginResponse.headers['set-cookie']);
    expect(sessionCookies).toBeDefined();

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookies!)
      .expect(200);

    expect(meResponse.body.email).toBe(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    );

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', sessionCookies!)
      .expect(200);

    expect(refreshResponse.body.message).toBe('Session refreshed');

    const refreshedCookies = mergeSetCookie(
      refreshResponse.headers['set-cookie'],
    );

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', refreshedCookies ?? sessionCookies!)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', refreshedCookies ?? sessionCookies!)
      .expect(401);
  });
});
