import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../constants/roles.enum';

const REFRESH_COOKIE_PATH = '/api/auth';

export function buildAccessTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configService.get<boolean>('cookie.secure', false),
    sameSite: configService.get<'strict' | 'lax' | 'none'>(
      'cookie.sameSite',
      'strict',
    ),
    maxAge: configService.get<number>('jwt.accessCookieMaxAgeMs', 900000),
    path: '/',
  };
}

export function buildRefreshTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configService.get<boolean>('cookie.secure', false),
    sameSite: configService.get<'strict' | 'lax' | 'none'>(
      'cookie.sameSite',
      'strict',
    ),
    maxAge: configService.get<number>('jwt.refreshCookieMaxAgeMs', 604800000),
    path: REFRESH_COOKIE_PATH,
  };
}

export function buildClearAccessTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const { maxAge: _maxAge, ...options } =
    buildAccessTokenCookieOptions(configService);
  return options;
}

export function buildClearRefreshTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const { maxAge: _maxAge, ...options } =
    buildRefreshTokenCookieOptions(configService);
  return options;
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
