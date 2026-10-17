import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-taller + presupuestos. El DDL completo está en
 * src/database/sql/1792200000000-talleres-presupuestos.sql (se copia a dist al compilar).
 */
export class TalleresPresupuestos1792200000000 implements MigrationInterface {
  name = 'TalleresPresupuestos1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, '..', 'sql', '1792200000000-talleres-presupuestos.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS presupuesto_items;
      DROP TABLE IF EXISTS presupuestos;
      DROP TABLE IF EXISTS catalogo_items;
      DROP TABLE IF EXISTS vehiculos;
      DROP TABLE IF EXISTS clientes;
      DROP TABLE IF EXISTS numeradores;

      ALTER TABLE users DROP CONSTRAINT IF EXISTS "UQ_users_taller_id";
      ALTER TABLE users DROP CONSTRAINT IF EXISTS "FK_users_taller";
      ALTER TABLE users DROP COLUMN IF EXISTS taller_id;
      ALTER TABLE users DROP COLUMN IF EXISTS is_active;

      DROP TABLE IF EXISTS talleres;

      DROP FUNCTION IF EXISTS trg_items_uso_catalogo();
      DROP FUNCTION IF EXISTS trg_items_recalcular();
      DROP FUNCTION IF EXISTS trg_presupuestos_calcular();
      DROP FUNCTION IF EXISTS trg_presupuestos_numerar();
      DROP FUNCTION IF EXISTS trg_catalogo_items_actualizar();
      DROP FUNCTION IF EXISTS trg_set_updated_at();
      DROP FUNCTION IF EXISTS app_taller_id();
      DROP FUNCTION IF EXISTS f_unaccent(text);

      DROP TYPE IF EXISTS unidad_medida;
      DROP TYPE IF EXISTS combustible;
      DROP TYPE IF EXISTS tipo_descuento;
      DROP TYPE IF EXISTS estado_presupuesto;
      DROP TYPE IF EXISTS tipo_item;
      DROP TYPE IF EXISTS condicion_iva;

      REVOKE USAGE ON SCHEMA public FROM presupuestos_app;
    `);
    // El rol es global del servidor (puede usarlo otra base): se elimina solo si quedó sin uso.
    await queryRunner.query(`
      DO $$
      BEGIN
        DROP ROLE IF EXISTS presupuestos_app;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'El rol presupuestos_app sigue en uso en otra base; no se elimina.';
      END
      $$;
    `);
  }
}
