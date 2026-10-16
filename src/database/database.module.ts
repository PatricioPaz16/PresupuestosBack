import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Permission } from '../modules/permissions/entities/permission.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { User } from '../modules/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        entities: [User, Role, Permission, RefreshToken],
        synchronize: configService.get<boolean>('database.synchronize'),
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: configService.get<boolean>('database.runMigrations'),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
