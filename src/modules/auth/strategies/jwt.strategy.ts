import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../../../common/constants/roles.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { RefreshTokenService } from '../refresh-token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const cookies = request?.cookies as
            | Record<string, string>
            | undefined;
          return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    // Se consulta la base en cada request: dar de baja a un usuario (o a un taller)
    // corta el acceso de inmediato, sin esperar a que venza el JWT.
    if (!user || !user.isActive || !user.taller?.activo) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // La sesión que emitió el JWT tiene que seguir vigente (logout la revoca).
    if (
      !payload.sid ||
      !(await this.refreshTokenService.isSessionActive(payload.sid))
    ) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return user;
  }
}
