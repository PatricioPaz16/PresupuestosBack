import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/** Rol de PostgreSQL sin login al que se cambia en cada transacción de negocio. */
export const ROL_NEGOCIO = 'presupuestos_app';

/**
 * Ejecuta trabajo de negocio "dentro" de un taller.
 *
 * Cada llamada abre una transacción y fija, solo para esa transacción:
 *   - el rol `presupuestos_app` (sujeto a Row Level Security, aunque la API se conecte
 *     como superusuario), y
 *   - `app.taller_id`, que las políticas usan para filtrar.
 *
 * Todo lo que se haga con el `EntityManager` recibido queda limitado al taller indicado:
 * si una consulta se olvida el filtro, PostgreSQL igual no devuelve datos de otro taller.
 */
@Injectable()
export class TenantService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly dataSource: DataSource) {}

  run<T>(
    tallerId: string,
    trabajo: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (em) => {
      await em.query(
        `SELECT set_config('role', $1, true), set_config('app.taller_id', $2, true)`,
        [ROL_NEGOCIO, tallerId],
      );
      return trabajo(em);
    });
  }

  /**
   * Comprueba al arrancar que el usuario de la base puede cambiar al rol de negocio.
   * Se prueba el SET ROLE real (dentro de una transacción que se descarta) porque es lo
   * único que vale igual en todas las versiones de PostgreSQL.
   */
  async onApplicationBootstrap(): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      const [usuario] = (await qr.query(
        `SELECT rolsuper AS superusuario FROM pg_roles WHERE rolname = current_user`,
      )) as Array<{ superusuario: boolean }>;
      await qr.startTransaction();
      await qr.query(`SELECT set_config('role', $1, true)`, [ROL_NEGOCIO]);
      await qr.rollbackTransaction();

      if (usuario?.superusuario) {
        this.logger.warn(
          'La API se conecta como superusuario. El aislamiento entre talleres se aplica igual ' +
            '(SET ROLE por transacción), pero en producción conviene un usuario sin superusuario.',
        );
      }
    } catch (error) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction().catch(() => undefined);
      }
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `La API no puede asumir el rol "${ROL_NEGOCIO}" (${detalle}). ` +
          'Si el rol no existe, faltan las migraciones (npm run migration:run). Si existe, ' +
          `ejecutá en PostgreSQL: GRANT ${ROL_NEGOCIO} TO <usuario de la API>; ` +
          '(en PostgreSQL 16 o superior agregá WITH SET TRUE).',
      );
    } finally {
      await qr.release();
    }
  }
}
