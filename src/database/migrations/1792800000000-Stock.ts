import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock de repuestos: cantidades en el catálogo, historial de movimientos y descuento
 * automático al aprobar un presupuesto. Detalle en src/database/sql/1792800000000-stock.sql.
 */
export class Stock1792800000000 implements MigrationInterface {
  name = 'Stock1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, '..', 'sql', '1792800000000-stock.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_presupuestos_30_stock" ON presupuestos;
      DROP FUNCTION IF EXISTS trg_presupuestos_stock();
      DROP TABLE IF EXISTS stock_movimientos;
      DROP FUNCTION IF EXISTS trg_stock_movimientos_aplicar();
      DROP TRIGGER IF EXISTS "TRG_catalogo_items_stock_inicial" ON catalogo_items;
      DROP FUNCTION IF EXISTS trg_catalogo_items_stock_inicial();

      CREATE OR REPLACE FUNCTION trg_catalogo_items_actualizar()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.precio_referencia IS DISTINCT FROM OLD.precio_referencia
           OR NEW.costo_referencia IS DISTINCT FROM OLD.costo_referencia THEN
          NEW.precio_actualizado_en := now();
        END IF;
        IF (NEW.tipo, NEW.nombre, NEW.marca, NEW.codigo, NEW.unidad,
            NEW.precio_referencia, NEW.costo_referencia, NEW.activo)
           IS DISTINCT FROM
           (OLD.tipo, OLD.nombre, OLD.marca, OLD.codigo, OLD.unidad,
            OLD.precio_referencia, OLD.costo_referencia, OLD.activo) THEN
          NEW.updated_at := now();
        END IF;
        RETURN NEW;
      END
      $$;

      DROP INDEX IF EXISTS "IDX_catalogo_items_stock";
      ALTER TABLE catalogo_items
        DROP CONSTRAINT IF EXISTS "CHK_catalogo_items_stock_tipo",
        DROP CONSTRAINT IF EXISTS "CHK_catalogo_items_ubicacion",
        DROP CONSTRAINT IF EXISTS "CHK_catalogo_items_stock_minimo",
        DROP CONSTRAINT IF EXISTS "CHK_catalogo_items_stock",
        DROP COLUMN IF EXISTS ubicacion,
        DROP COLUMN IF EXISTS stock_minimo,
        DROP COLUMN IF EXISTS stock,
        DROP COLUMN IF EXISTS controla_stock;
    `);
  }
}
