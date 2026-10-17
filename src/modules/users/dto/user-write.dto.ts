import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { RoleName } from '../../../common/constants/roles.enum';
import {
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
} from '../../../common/validators/password.validator';

export class CreateUserDto {
  @ApiProperty({ example: 'mecanico@taller.com' })
  @IsEmail({}, { message: 'El email no es válido.' })
  email: string;

  @ApiProperty({ example: 'Juan Gómez' })
  @IsString()
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres.' })
  fullName: string;

  @ApiProperty({ description: 'Contraseña inicial' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName, { message: 'El rol debe ser ADMIN o USER.' })
  role: RoleName;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres.' })
  fullName?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName, { message: 'El rol debe ser ADMIN o USER.' })
  role?: RoleName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Nueva contraseña (cierra las sesiones abiertas)',
  })
  @IsOptional()
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password?: string;
}
