import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Permission } from '../modules/permissions/entities/permission.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { User } from '../modules/users/entities/user.entity';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'back_base_nest',
  entities: [User, Role, Permission, RefreshToken],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
