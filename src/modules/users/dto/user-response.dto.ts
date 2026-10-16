import { Expose, Type } from 'class-transformer';

export class RoleResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  fullName: string;

  @Expose()
  @Type(() => RoleResponseDto)
  role: RoleResponseDto;
}
