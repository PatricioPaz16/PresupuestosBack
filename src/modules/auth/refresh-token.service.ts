import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  async createForUser(
    user: User,
  ): Promise<{ rawToken: string; sessionId: string }> {
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() +
        this.configService.get<number>('jwt.refreshCookieMaxAgeMs', 604800000),
    );

    const saved = await this.refreshTokenRepository.save({
      tokenHash,
      userId: user.id,
      expiresAt,
    });

    return { rawToken, sessionId: saved.id };
  }

  /** Sesión vigente = refresh token sin revocar y sin vencer. */
  isSessionActive(sessionId: string): Promise<boolean> {
    return this.refreshTokenRepository.exists({
      where: {
        id: sessionId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  async validateAndRotate(rawToken: string): Promise<{
    user: User;
    newRawToken: string;
    sessionId: string;
  }> {
    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user', 'user.role', 'user.taller'],
    });

    if (
      !storedToken ||
      !storedToken.user.isActive ||
      !storedToken.user.taller?.activo
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    storedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(storedToken);

    const { rawToken: newRawToken, sessionId } = await this.createForUser(
      storedToken.user,
    );

    return {
      user: storedToken.user,
      newRawToken,
      sessionId,
    };
  }

  async revokeByRawToken(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });

    if (!storedToken) {
      return;
    }

    storedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(storedToken);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
