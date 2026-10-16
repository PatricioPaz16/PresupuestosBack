import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../constants/roles.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
