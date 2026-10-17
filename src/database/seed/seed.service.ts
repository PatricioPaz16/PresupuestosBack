import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import {
  PERMISSIONS,
  SEED_PERMISSIONS,
} from '../../common/constants/permissions.constant';
import { RoleName } from '../../common/constants/roles.enum';
import { TenantService } from '../../common/database/tenant.service';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { sembrarDatosDemo } from './demo-data';

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
    private readonly dataSource: DataSource,
    private readonly tenant: TenantService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (await this.dataSource.showMigrations()) {
      this.logger.error(
        'Hay migraciones pendientes. Ejecutá "npm run migration:run" o iniciá con TYPEORM_RUN_MIGRATIONS=true.',
      );
      return;
    }

    await this.seedPermissions();
    await this.seedRoles();
    const tallerId = await this.ensureDefaultTaller();
    await this.seedAdminUser(tallerId);

    if (this.configService.get<boolean>('seed.demo')) {
      const sembrado = await this.tenant.run(tallerId, (em) =>
        sembrarDatosDemo(em),
      );
      if (sembrado) {
        this.logger.log('Datos de ejemplo cargados en el taller inicial');
      }
    }

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

  /** Base vacía: crea un taller inicial para el administrador del seed. */
  private async ensureDefaultTaller(): Promise<string> {
    const [existente] = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM talleres ORDER BY created_at LIMIT 1`,
    );
    if (existente) {
      return existente.id;
    }

    const [creado] = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO talleres (nombre, direccion, localidad, telefono, email)
       VALUES ('Taller Demo', 'Av. San Martín 1450', 'Córdoba', '351 555-0142', 'contacto@tallerdemo.com.ar')
       RETURNING id`,
    );
    this.logger.log('Taller inicial creado: Taller Demo');
    return creado.id;
  }

  private async seedAdminUser(tallerId: string): Promise<void> {
    const adminEmail = (
      this.configService.get<string>('seed.adminEmail') ?? 'admin@example.com'
    ).toLowerCase();
    const adminPassword =
      this.configService.get<string>('seed.adminPassword') ?? 'Admin123!';

    // Solo con la tabla de usuarios vacía (primer arranque). Si se creara cada vez que
    // falta ese email, al renombrar o borrar al admin reaparecería un usuario con la
    // contraseña por defecto del .env.
    if ((await this.userRepository.count()) > 0) {
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
      fullName: 'Administrador del taller',
      role: adminRole,
      tallerId,
    });

    this.logger.log(`Default admin user created: ${adminEmail}`);
  }
}
