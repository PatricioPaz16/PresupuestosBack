import {
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

    await this.usersService.recordSuccessfulLogin(user.id);
    const refreshedUser = (await this.usersService.findById(user.id))!;

    const accessToken = await this.signAccessToken(refreshedUser);
    const refreshToken =
      await this.refreshTokenService.createForUser(refreshedUser);

    return {
      accessToken,
      refreshToken,
      user: refreshedUser,
    };
  }

  async refreshSession(rawRefreshToken: string): Promise<AuthTokens> {
    const { user, newRawToken } =
      await this.refreshTokenService.validateAndRotate(rawRefreshToken);

    const accessToken = await this.signAccessToken(user);

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

  signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
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
