import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/users/entities/user.entity';

/** Taller del usuario autenticado. Todo endpoint de negocio opera dentro de este taller. */
export const TallerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    return request.user.tallerId;
  },
);
