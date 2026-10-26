import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlace público de cada presupuesto (link para el cliente, con su PDF) y registro de
 * cuándo lo abrió. Detalle en src/database/sql/1792700000000-enlace-publico.sql.
 */
export class EnlacePublico1792700000000 implements MigrationInterface {
  name = 'EnlacePublico1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, '..', 'sql', '1792700000000-enlace-publico.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS presupuesto_enlaces`);
  }
}
