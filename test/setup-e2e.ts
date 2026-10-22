import { config } from 'dotenv';

/**
 * Los tests e2e crean talleres, usuarios y presupuestos de prueba que quedan guardados.
 * Para no ensuciar la base real (Supabase u otra en la nube) solo corren contra un
 * PostgreSQL local, salvo que se pida lo contrario con E2E_PERMITIR_BASE_REMOTA=true.
 */
config({ quiet: true });

const host = process.env.DB_HOST ?? 'localhost';
// Sin punto en el nombre = máquina local o servicio de Docker ("db", "postgres").
const esLocal =
  ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host) ||
  !host.includes('.');

if (!esLocal && process.env.E2E_PERMITIR_BASE_REMOTA !== 'true') {
  throw new Error(
    `Los tests e2e escriben datos de prueba y DB_HOST apunta a "${host}". ` +
      'Corrélos contra un PostgreSQL local (DB_HOST=localhost DB_NAME=presupuestos_test) ' +
      'o, si es a propósito, con E2E_PERMITIR_BASE_REMOTA=true.',
  );
}
