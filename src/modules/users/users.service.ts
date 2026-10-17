import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, IsNull, Repository } from 'typeorm';
import { RoleName } from '../../common/constants/roles.enum';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role } from '../roles/entities/role.entity';
import { CreateUserDto, UpdateUserDto } from './dto/user-write.dto';
import { User } from './entities/user.entity';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /** Usuarios del taller (un administrador nunca ve usuarios de otros talleres). */
  findAllByTaller(tallerId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tallerId },
      order: { isActive: 'DESC', fullName: 'ASC' },
    });
  }

  /** Nombres para mostrar "creado por" sin dar al rol de negocio acceso a la tabla users. */
  async nombresPorId(
    tallerId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (unicos.length === 0) {
      return new Map();
    }
    const usuarios = await this.userRepository.find({
      select: { id: true, fullName: true },
      where: { tallerId, id: In(unicos) },
    });
    return new Map(usuarios.map((u) => [u.id, u.fullName]));
  }

  async create(tallerId: string, dto: CreateUserDto): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepository.exists({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese email.');
    }

    const user = this.userRepository.create({
      email,
      fullName: dto.fullName.trim(),
      password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: await this.getRole(dto.role),
      tallerId,
      isActive: true,
    });
    const saved = await this.userRepository.save(user);
    return (await this.findById(saved.id))!;
  }

  async update(
    tallerId: string,
    actorId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id, tallerId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const esUnoMismo = user.id === actorId;
    if (esUnoMismo && dto.isActive === false) {
      throw new BadRequestException('No podés desactivar tu propio usuario.');
    }
    if (esUnoMismo && dto.role && dto.role !== RoleName.ADMIN) {
      throw new BadRequestException(
        'No podés quitarte el rol de administrador.',
      );
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.role !== undefined) user.role = await this.getRole(dto.role);
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    let cerrarSesiones = dto.isActive === false;
    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      cerrarSesiones = true;
    }

    await this.userRepository.save(user);

    if (cerrarSesiones) {
      await this.refreshTokenRepository.update(
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    return (await this.findById(user.id))!;
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  async recordFailedLogin(
    userId: string,
    failedAttempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      failedLoginAttempts: failedAttempts,
      lockedUntil,
    });
  }

  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { name } });
    if (!role) {
      throw new BadRequestException(`El rol ${name} no existe.`);
    }
    return role;
  }
}
