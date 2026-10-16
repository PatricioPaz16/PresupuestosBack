import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ACCESS_TOKEN_COOKIE,
  buildAccessTokenCookieOptions,
  buildClearAccessTokenCookieOptions,
  buildClearRefreshTokenCookieOptions,
  buildRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from '../../common/utils/cookie.util';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';
import { toUserResponseDto } from '../users/mappers/user.mapper';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ login: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({
    summary: 'Login',
    description:
      'Sets HttpOnly cookies access_token and refresh_token. JWT is never returned in the body.',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponseDto> {
    const { user, accessToken, refreshToken } =
      await this.authService.login(loginDto);

    this.setAuthCookies(response, accessToken, refreshToken);

    return toUserResponseDto(user);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh session',
    description:
      'Rotates refresh token and issues a new access token via HttpOnly cookies.',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const { user, accessToken, refreshToken } =
      await this.authService.refreshSession(rawRefreshToken);

    this.setAuthCookies(response, accessToken, refreshToken);

    return { message: 'Session refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(
    @CurrentUser() currentUser: User,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const rawRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    await this.authService.logout(currentUser.id, rawRefreshToken);
    this.clearAuthCookies(response);

    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user profile' })
  async me(@CurrentUser() currentUser: User): Promise<UserResponseDto> {
    const user = await this.usersService.findById(currentUser.id);

    return toUserResponseDto(user!);
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      buildAccessTokenCookieOptions(this.configService),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      buildRefreshTokenCookieOptions(this.configService),
    );
  }

  private clearAuthCookies(response: Response): void {
    response.clearCookie(
      ACCESS_TOKEN_COOKIE,
      buildClearAccessTokenCookieOptions(this.configService),
    );
    response.clearCookie(
      REFRESH_TOKEN_COOKIE,
      buildClearRefreshTokenCookieOptions(this.configService),
    );
  }
}
