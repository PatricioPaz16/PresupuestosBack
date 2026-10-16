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

  async createForUser(user: User): Promise<string> {
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() +
        this.configService.get<number>('jwt.refreshCookieMaxAgeMs', 604800000),
    );

    await this.refreshTokenRepository.save({
      tokenHash,
      userId: user.id,
      expiresAt,
    });

    return rawToken;
  }

  async validateAndRotate(rawToken: string): Promise<{
    user: User;
    newRawToken: string;
  }> {
    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['user', 'user.role'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    storedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(storedToken);

    const newRawToken = await this.createForUser(storedToken.user);

    return {
      user: storedToken.user,
      newRawToken,
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
