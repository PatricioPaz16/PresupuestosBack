import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../../../common/constants/roles.enum';
import type { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { leerTokenPublico } from './token-publico';

/**
 * ¿Quien abre el enlace público es un usuario del mismo taller (con sesión iniciada)?
 * Sirve para no registrar como "lo vio el cliente" las veces que el taller prueba su
 * propio link. Si la cookie no está o no es válida, se trata como un visitante más.
 */
@Injectable()
export class SesionTallerService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async esDelTaller(req: Request, token: string): Promise<boolean> {
    const datos = leerTokenPublico(token);
    const cookies = req.cookies as Record<string, string> | undefined;
    const acceso = cookies?.[ACCESS_TOKEN_COOKIE];
    if (!datos || !acceso) {
      return false;
    }
    try {
      const { sub } = await this.jwt.verifyAsync<JwtPayload>(acceso);
      const usuario = await this.users.findById(sub);
      return !!usuario?.isActive && usuario.taller?.id === datos.tallerId;
    } catch {
      return false;
    }
  }
}
