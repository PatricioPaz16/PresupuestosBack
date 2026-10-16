import { plainToInstance } from 'class-transformer';
import { User } from '../entities/user.entity';
import { UserResponseDto } from '../dto/user-response.dto';

export function toUserResponseDto(user: User): UserResponseDto {
  return plainToInstance(UserResponseDto, user, {
    excludeExtraneousValues: true,
  });
}

export function toUserResponseDtoList(users: User[]): UserResponseDto[] {
  return users.map((user) => toUserResponseDto(user));
}
