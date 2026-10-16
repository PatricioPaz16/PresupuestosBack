import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { PERMISSIONS, SEED_PERMISSIONS } from '../../common/constants/permissions.constant';
import { RoleName } from '../../common/constants/roles.enum';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedAdminUser();
    this.logger.log('Database seed completed');
  }

  private async seedPermissions(): Promise<void> {
    for (const action of SEED_PERMISSIONS) {
      const exists = await this.permissionRepository.findOne({
        where: { action },
      });

      if (!exists) {
        await this.permissionRepository.save({ action });
        this.logger.log(`Permission created: ${action}`);
      }
    }
  }

  private async seedRoles(): Promise<void> {
    const allPermissions = await this.permissionRepository.find();

    const roleDefinitions: Array<{
      name: RoleName;
      permissionActions: string[];
    }> = [
      {
        name: RoleName.ADMIN,
        permissionActions: [
          PERMISSIONS.USERS_READ,
          PERMISSIONS.USERS_MANAGE,
          PERMISSIONS.AUTH_ME,
        ],
      },
      {
        name: RoleName.USER,
        permissionActions: [PERMISSIONS.AUTH_ME],
      },
    ];

    for (const definition of roleDefinitions) {
      let role = await this.roleRepository.findOne({
        where: { name: definition.name },
        relations: ['permissions'],
      });

      const permissions = allPermissions.filter((permission) =>
        definition.permissionActions.includes(permission.action),
      );

      if (!role) {
        role = this.roleRepository.create({
          name: definition.name,
          permissions,
        });
        await this.roleRepository.save(role);
        this.logger.log(`Role created: ${definition.name}`);
        continue;
      }

      role.permissions = permissions;
      await this.roleRepository.save(role);
    }
  }

  private async seedAdminUser(): Promise<void> {
    const adminEmail =
      this.configService.get<string>('seed.adminEmail') ?? 'admin@example.com';
    const adminPassword =
      this.configService.get<string>('seed.adminPassword') ?? 'Admin123!';

    const existingAdmin = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      return;
    }

    const adminRole = await this.roleRepository.findOne({
      where: { name: RoleName.ADMIN },
    });

    if (!adminRole) {
      this.logger.warn('ADMIN role not found; skipping admin user seed');
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await this.userRepository.save({
      email: adminEmail,
      password: passwordHash,
      fullName: 'System Administrator',
      role: adminRole,
    });

    this.logger.log(`Default admin user created: ${adminEmail}`);
  }
}
