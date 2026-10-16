import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '../../../common/validators/password.validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
}
