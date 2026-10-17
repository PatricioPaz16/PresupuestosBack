import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenService } from './refresh-token.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthTokens> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.ensureAccountNotLocked(user);

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Se informa recién después de validar la contraseña para no revelar qué cuentas existen.
    if (!user.isActive || !user.taller?.activo) {
      throw new ForbiddenException(
        'El usuario o el taller están desactivados. Consultá con el administrador.',
      );
    }

    await this.usersService.recordSuccessfulLogin(user.id);
    const refreshedUser = (await this.usersService.findById(user.id))!;

    const { rawToken: refreshToken, sessionId } =
      await this.refreshTokenService.createForUser(refreshedUser);
    const accessToken = await this.signAccessToken(refreshedUser, sessionId);

    return {
      accessToken,
      refreshToken,
      user: refreshedUser,
    };
  }

  async refreshSession(rawRefreshToken: string): Promise<AuthTokens> {
    const { user, newRawToken, sessionId } =
      await this.refreshTokenService.validateAndRotate(rawRefreshToken);

    const accessToken = await this.signAccessToken(user, sessionId);

    return {
      accessToken,
      refreshToken: newRawToken,
      user,
    };
  }

  async logout(
    userId: string,
    rawRefreshToken: string | undefined,
  ): Promise<void> {
    await this.refreshTokenService.revokeByRawToken(rawRefreshToken);
    await this.refreshTokenService.revokeAllForUser(userId);
  }

  /**
   * El JWT lleva el id de la sesión (refresh token) que lo emitió. JwtStrategy verifica en
   * cada request que esa sesión siga vigente: logout, baja del usuario o cambio de
   * contraseña cortan el acceso en el momento, sin esperar a que venza el JWT.
   */
  signAccessToken(user: User, sessionId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sid: sessionId,
    };

    return this.jwtService.signAsync(payload);
  }

  private ensureAccountNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Account temporarily locked due to failed login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const maxAttempts = this.configService.get<number>(
      'security.maxLoginAttempts',
      5,
    );
    const lockoutMinutes = this.configService.get<number>(
      'security.lockoutMinutes',
      15,
    );

    const failedAttempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      failedAttempts >= maxAttempts
        ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
        : null;

    await this.usersService.recordFailedLogin(
      user.id,
      failedAttempts,
      lockedUntil,
    );
  }
}
