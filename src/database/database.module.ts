import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configurarTiposPg } from '../common/database/pg-types';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Permission } from '../modules/permissions/entities/permission.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { Taller } from '../modules/talleres/entities/taller.entity';
import { User } from '../modules/users/entities/user.entity';
import { opcionesSsl } from './ssl';

configurarTiposPg();

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
        ssl: opcionesSsl(
          configService.get<boolean>('database.ssl', false),
          configService.get<string>('database.sslCa'),
        ),
        entities: [User, Role, Permission, RefreshToken, Taller],
        // Siempre false: el esquema usa RLS, triggers, columnas generadas y FKs compuestas
        // que `synchronize` no conoce y podría borrar. El esquema se maneja con migraciones.
        synchronize: false,
        migrations: ['dist/database/migrations/*.js'],
        // Misma tabla que usa el CLI (data-source.ts): si no coinciden, la app volvería a
        // correr migraciones que ya aplicó `npm run migration:run`.
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: configService.get<boolean>('database.runMigrations'),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
