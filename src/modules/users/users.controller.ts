import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE,
  RoleName,
} from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TallerId } from '../../common/decorators/taller-id.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user-write.dto';
import { User } from './entities/user.entity';
import {
  toUserResponseDto,
  toUserResponseDtoList,
} from './mappers/user.mapper';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('users')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Usuarios del taller (ADMIN)' })
  async findAll(@TallerId() tallerId: string): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAllByTaller(tallerId);
    return toUserResponseDtoList(users);
  }

  @Post()
  @ApiOperation({ summary: 'Crear usuario en el taller (ADMIN)' })
  async create(
    @TallerId() tallerId: string,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    return toUserResponseDto(await this.usersService.create(tallerId, dto));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar rol, estado o contraseña de un usuario del taller (ADMIN)',
  })
  async update(
    @TallerId() tallerId: string,
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return toUserResponseDto(
      await this.usersService.update(tallerId, actor.id, id, dto),
    );
  }
}
