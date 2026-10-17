import { Expose, Type } from 'class-transformer';

export class RoleResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class TallerResumenDto {
  @Expose()
  id: string;

  @Expose()
  nombre: string;
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

  @Expose()
  @Type(() => TallerResumenDto)
  taller: TallerResumenDto;

  @Expose()
  isActive: boolean;

  @Expose()
  lastLoginAt: Date | null;
}
