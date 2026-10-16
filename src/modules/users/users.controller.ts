import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '../../common/constants/roles.enum';
import { RoleName } from '../../common/constants/roles.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserResponseDto } from './dto/user-response.dto';
import { toUserResponseDtoList } from './mappers/user.mapper';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'List all users (ADMIN only)' })
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();
    return toUserResponseDtoList(users);
  }
}
