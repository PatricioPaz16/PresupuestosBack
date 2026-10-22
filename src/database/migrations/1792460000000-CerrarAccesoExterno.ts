import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supabase (y cualquier instalación con PostgREST) les da a los roles web "anon" y
 * "authenticated" acceso a las tablas nuevas del esquema public. Esta migración se lo
 * quita y activa RLS en las tablas de autenticación. Sin esos roles, no hace nada.
 * Detalle en src/database/sql/1792460000000-cerrar-acceso-externo.sql.
 */
export class CerrarAccesoExterno1792460000000 implements MigrationInterface {
  name = 'CerrarAccesoExterno1792460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, '..', 'sql', '1792460000000-cerrar-acceso-externo.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  /** Vuelve a los permisos que Supabase da por defecto. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_rol   text;
        v_tabla text;
        v_tablas_app text[] := ARRAY[
          'users', 'roles', 'permissions', 'role_permissions', 'refresh_tokens',
          'typeorm_migrations', 'talleres', 'numeradores', 'clientes', 'vehiculos',
          'catalogo_items', 'presupuestos', 'presupuesto_items'];
        v_sin_rls text[] := ARRAY[
          'users', 'roles', 'permissions', 'role_permissions', 'refresh_tokens',
          'typeorm_migrations'];
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) THEN
          RETURN;
        END IF;

        FOREACH v_tabla IN ARRAY v_sin_rls LOOP
          IF to_regclass(format('public.%I', v_tabla)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', v_tabla);
          END IF;
        END LOOP;

        FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol);
          FOREACH v_tabla IN ARRAY v_tablas_app LOOP
            IF to_regclass(format('public.%I', v_tabla)) IS NOT NULL THEN
              EXECUTE format('GRANT ALL ON TABLE public.%I TO %I', v_tabla, v_rol);
            END IF;
          END LOOP;
          EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', v_rol);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', v_rol);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', v_rol);
        END LOOP;
      END
      $$;
    `);
  }
}
