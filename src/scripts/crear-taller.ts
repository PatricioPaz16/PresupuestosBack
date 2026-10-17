/**
 * Alta de un taller nuevo con su primer administrador.
 *
 *   npm run taller:crear -- --nombre "Taller Norte" --email admin@norte.com \
 *        --password "Clave123!" --admin "Juan Gómez"
 *
 * Después, ese administrador crea los usuarios de su taller desde la pantalla Usuarios.
 */
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';
import { AppModule } from '../app.module';
import {
  PASSWORD_MESSAGE,
  PASSWORD_REGEX,
} from '../common/validators/password.validator';
import { TalleresService } from '../modules/talleres/talleres.service';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      nombre: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string' },
      admin: { type: 'string' },
    },
  });

  const faltan = (['nombre', 'email', 'password'] as const).filter(
    (clave) => !values[clave],
  );
  if (faltan.length > 0) {
    console.error(
      `Faltan parámetros: ${faltan.map((f) => `--${f}`).join(', ')}`,
    );
    console.error(
      'Uso: npm run taller:crear -- --nombre "Taller Norte" --email admin@norte.com --password "Clave123!" --admin "Juan Gómez"',
    );
    process.exit(1);
  }
  if (!PASSWORD_REGEX.test(values.password!)) {
    console.error(PASSWORD_MESSAGE);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const resultado = await app.get(TalleresService).crearConAdmin({
      nombre: values.nombre!,
      adminEmail: values.email!,
      adminPassword: values.password!,
      adminNombre: values.admin ?? 'Administrador',
    });
    console.log(`Taller creado: ${values.nombre} (${resultado.tallerId})`);
    console.log(`Administrador: ${values.email!.toLowerCase()}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
