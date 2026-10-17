import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { TalleresService } from '../src/modules/talleres/talleres.service';

/**
 * Flujo completo de presupuestos y aislamiento entre talleres contra PostgreSQL real.
 * Requiere la base configurada en .env (recomendado: una base aparte, DB_NAME=presupuestos_test).
 */

function cookiesDe(setCookie: string[] | string | undefined): string {
  const lista = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return lista.map((cookie) => cookie.split(';')[0]).join('; ');
}

function patenteAleatoria(): string {
  const letras = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const l = () => letras[randomInt(letras.length)];
  return `${l()}${l()}${randomInt(100, 999)}${l()}${l()}`;
}

describe('Presupuestos (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let cookiesA: string;
  let cookiesB: string;

  const sufijo = `${Date.now()}${randomInt(1000)}`;
  const passwordB = 'TallerB123!';
  const emailB = `admin-b-${sufijo}@example.com`;

  async function login(email: string, password: string): Promise<string> {
    const respuesta = await http
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return cookiesDe(respuesta.headers['set-cookie']);
  }

  async function crearVehiculo(cookies: string, patente = patenteAleatoria()) {
    const respuesta = await http
      .post('/api/vehiculos')
      .set('Cookie', cookies)
      .send({
        patente,
        marca: 'Volkswagen',
        modelo: 'Gol Trend',
        anio: 2015,
        cliente: {
          nombre: 'Juan',
          apellido: 'Pérez',
          telefono: '011 15 2345-6789',
        },
      })
      .expect(201);
    return respuesta.body as {
      id: string;
      patente: string;
      cliente: { id: string; telefono: string };
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    http = request(app.getHttpServer());

    cookiesA = await login(
      process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
      process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
    );

    await app.get(TalleresService).crearConAdmin({
      nombre: `Taller B ${sufijo}`,
      adminEmail: emailB,
      adminNombre: 'Admin B',
      adminPassword: passwordB,
    });
    cookiesB = await login(emailB, passwordB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('alta rápida: normaliza patente y teléfono, y la búsqueda devuelve auto y dueño', async () => {
    const patente = patenteAleatoria();
    const vehiculo = await crearVehiculo(
      cookiesA,
      `${patente.slice(0, 2).toLowerCase()} ${patente.slice(2, 5)}-${patente.slice(5)}`,
    );
    expect(vehiculo.patente).toBe(patente);
    expect(vehiculo.cliente.telefono).toBe('+5491123456789');

    const busqueda = await http
      .get('/api/vehiculos/buscar')
      .query({ patente })
      .set('Cookie', cookiesA)
      .expect(200);
    expect(busqueda.body.vehiculo.id).toBe(vehiculo.id);
    expect(busqueda.body.vehiculo.cliente.nombre).toBe('Juan');

    await http
      .post('/api/vehiculos')
      .set('Cookie', cookiesA)
      .send({
        patente,
        marca: 'Fiat',
        modelo: 'Uno',
        clienteId: vehiculo.cliente.id,
      })
      .expect(409);
  });

  it('calcula subtotales y total en la base, con ítems de catálogo y libres', async () => {
    const vehiculo = await crearVehiculo(cookiesA);
    const catalogo = await http
      .post('/api/catalogo')
      .set('Cookie', cookiesA)
      .send({
        tipo: 'repuesto',
        nombre: `Aceite prueba ${sufijo}`,
        unidad: 'l',
        precioReferencia: '12345.67',
      })
      .expect(201);

    const creado = await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculo.id,
        kilometraje: 120000,
        motivoIngreso: 'Ruido en tren delantero',
        ivaPorcentaje: 21,
        items: [
          {
            tipo: 'repuesto',
            catalogoItemId: catalogo.body.id,
            descripcion: 'Aceite 10W40',
            unidad: 'l',
            cantidad: '4.5',
            precioCosto: '9000',
            precioUnitario: '12345.67',
          },
          {
            tipo: 'repuesto',
            descripcion: 'Extremo de dirección derecho',
            proveedor: 'Casa de Repuestos X',
            cantidad: '1',
            precioCosto: '30000',
            precioUnitario: '45000',
          },
          {
            tipo: 'trabajo',
            descripcion: 'Cambio de aceite',
            cantidad: '1',
            precioUnitario: '25000',
          },
        ],
        // Un total "inventado" por el navegador se rechaza (whitelist) y nunca se usa.
      })
      .expect(201);

    const p = creado.body;
    expect(p.numero).toBeGreaterThan(0);
    expect(p.numeroFormateado).toMatch(/^\d{5,}$/);
    expect(p.estado).toBe('borrador');
    expect(p.version).toBe(1);
    // 4.5 x 12345.67 = 55555.515 -> 55555.52 (redondeo de PostgreSQL)
    expect(p.items[0].subtotal).toBe('55555.52');
    expect(p.totales.subtotalRepuestos).toBe('100555.52');
    expect(p.totales.subtotalTrabajos).toBe('25000.00');
    expect(p.totales.ivaMonto).toBe('26366.66');
    expect(p.totales.total).toBe('151922.18');
    expect(p.totales.costoTotal).toBe('70500.00');

    // Edición: se quita el trabajo, se cambia un precio y se agrega un descuento del 10%.
    const editado = await http
      .put(`/api/presupuestos/${p.id}`)
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculo.id,
        version: p.version,
        ivaPorcentaje: 0,
        descuentoTipo: 'porcentaje',
        descuentoValor: '10',
        // Se reenvían los ítems tal como volvieron (con su id), sin el subtotal calculado.
        items: [p.items[0], { ...p.items[1], precioUnitario: '50000' }].map(
          ({ subtotal: _subtotal, ...item }: Record<string, unknown>) => item,
        ),
      })
      .expect(200);

    expect(editado.body.version).toBe(2);
    expect(editado.body.items).toHaveLength(2);
    expect(editado.body.items[0].id).toBe(p.items[0].id); // ids estables al editar
    // (55555.52 + 50000) = 105555.52 ; -10% = 10555.55 ; total 94999.97
    expect(editado.body.totales.descuentoMonto).toBe('10555.55');
    expect(editado.body.totales.total).toBe('94999.97');

    // Guardar sobre una versión vieja: 409 sin pisar los cambios.
    const conflicto = await http
      .put(`/api/presupuestos/${p.id}`)
      .set('Cookie', cookiesA)
      .send({ vehiculoId: vehiculo.id, version: 1, items: [] })
      .expect(409);
    expect(conflicto.body.code).toBe('VERSION_CONFLICTO');
  });

  it('el documento para imprimir no expone costos, proveedores ni notas internas', async () => {
    const vehiculo = await crearVehiculo(cookiesA);
    const creado = await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculo.id,
        notasInternas: 'El cliente regatea, no bajar de 40.000',
        notasCliente: 'Se recomienda cambiar cubiertas en el próximo service.',
        items: [
          {
            tipo: 'repuesto',
            descripcion: 'Bomba de agua',
            proveedor: 'Repuestera Norte',
            cantidad: '1',
            precioCosto: '67000',
            precioUnitario: '96000',
          },
        ],
      })
      .expect(201);

    const documento = await http
      .get(`/api/presupuestos/${creado.body.id}/documento`)
      .set('Cookie', cookiesA)
      .expect(200);

    const json = JSON.stringify(documento.body);
    for (const prohibido of [
      'precioCosto',
      'proveedor',
      'Repuestera Norte',
      'notasInternas',
      'regatea',
      'costoTotal',
      'creadoPor',
    ]) {
      expect(json).not.toContain(prohibido);
    }
    expect(documento.body.repuestos).toEqual([
      {
        descripcion: 'Bomba de agua',
        unidad: 'u',
        cantidad: '1.000',
        precioUnitario: '96000.00',
        subtotal: '96000.00',
      },
    ]);
    expect(documento.body.notasCliente).toContain('cubiertas');
    expect(documento.body.leyenda).toBe('Documento no válido como factura.');
    expect(documento.body.condiciones).toContain('días');
  });

  it('respeta las transiciones de estado; aprobado no se edita y se puede duplicar', async () => {
    const vehiculo = await crearVehiculo(cookiesA);
    const vacio = await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesA)
      .send({ vehiculoId: vehiculo.id, items: [] })
      .expect(201);

    await http
      .patch(`/api/presupuestos/${vacio.body.id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'enviado' })
      .expect(409); // sin ítems

    const p = await http
      .put(`/api/presupuestos/${vacio.body.id}`)
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculo.id,
        version: vacio.body.version,
        items: [
          {
            tipo: 'trabajo',
            descripcion: 'Diagnóstico',
            cantidad: '1',
            precioUnitario: '30000',
          },
        ],
      })
      .expect(200);

    const enviado = await http
      .patch(`/api/presupuestos/${p.body.id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'enviado', version: p.body.version })
      .expect(200);
    expect(enviado.body.enviadoEn).not.toBeNull();

    const aprobado = await http
      .patch(`/api/presupuestos/${p.body.id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'aprobado' })
      .expect(200);
    expect(aprobado.body.respondidoEn).not.toBeNull();

    await http
      .patch(`/api/presupuestos/${p.body.id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'borrador' })
      .expect(409);

    await http
      .put(`/api/presupuestos/${p.body.id}`)
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculo.id,
        version: aprobado.body.version,
        items: [],
      })
      .expect(409);

    const copia = await http
      .post(`/api/presupuestos/${p.body.id}/duplicar`)
      .set('Cookie', cookiesA)
      .expect(201);
    expect(copia.body.estado).toBe('borrador');
    expect(copia.body.numero).toBeGreaterThan(p.body.numero);
    expect(copia.body.totales.total).toBe(aprobado.body.totales.total);

    await http
      .delete(`/api/presupuestos/${p.body.id}`)
      .set('Cookie', cookiesA)
      .expect(409);
    await http
      .delete(`/api/presupuestos/${copia.body.id}`)
      .set('Cookie', cookiesA)
      .expect(204);
  });

  it('aísla los talleres: B no ve, no modifica y no referencia datos de A', async () => {
    const vehiculoA = await crearVehiculo(cookiesA);
    const presupuestoA = await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesA)
      .send({
        vehiculoId: vehiculoA.id,
        items: [
          {
            tipo: 'trabajo',
            descripcion: 'Service',
            cantidad: '1',
            precioUnitario: '50000',
          },
        ],
      })
      .expect(201);

    await http
      .get(`/api/presupuestos/${presupuestoA.body.id}`)
      .set('Cookie', cookiesB)
      .expect(404);
    await http
      .get(`/api/presupuestos/${presupuestoA.body.id}/documento`)
      .set('Cookie', cookiesB)
      .expect(404);
    await http
      .put(`/api/presupuestos/${presupuestoA.body.id}`)
      .set('Cookie', cookiesB)
      .send({ vehiculoId: vehiculoA.id, version: 1, items: [] })
      .expect(404);
    await http
      .get(`/api/vehiculos/${vehiculoA.id}`)
      .set('Cookie', cookiesB)
      .expect(404);
    await http
      .get(`/api/clientes/${vehiculoA.cliente.id}`)
      .set('Cookie', cookiesB)
      .expect(404);

    const busqueda = await http
      .get('/api/vehiculos/buscar')
      .query({ patente: vehiculoA.patente })
      .set('Cookie', cookiesB)
      .expect(200);
    expect(busqueda.body.vehiculo).toBeNull();
    expect(busqueda.body.coincidencias).toEqual([]);

    // B no puede armar un presupuesto sobre el vehículo de A...
    await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesB)
      .send({ vehiculoId: vehiculoA.id, items: [] })
      .expect(400);

    // ...pero sí puede cargar el mismo auto en su propio taller.
    const vehiculoB = await crearVehiculo(cookiesB, vehiculoA.patente);
    await http
      .post('/api/vehiculos')
      .set('Cookie', cookiesB)
      .send({
        patente: patenteAleatoria(),
        marca: 'Fiat',
        modelo: 'Uno',
        clienteId: vehiculoA.cliente.id,
      })
      .expect(400);

    const listaB = await http
      .get('/api/presupuestos')
      .set('Cookie', cookiesB)
      .expect(200);
    expect(listaB.body.items.map((i: { id: string }) => i.id)).not.toContain(
      presupuestoA.body.id,
    );

    const usuariosB = await http
      .get('/api/users')
      .set('Cookie', cookiesB)
      .expect(200);
    expect(usuariosB.body).toHaveLength(1);
    expect(usuariosB.body[0].email).toBe(emailB);
    expect(vehiculoB.patente).toBe(vehiculoA.patente);
  });

  it('numera correlativo por taller aunque se creen presupuestos en paralelo', async () => {
    const vehiculo = await crearVehiculo(cookiesB);
    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () =>
        http
          .post('/api/presupuestos')
          .set('Cookie', cookiesB)
          .send({ vehiculoId: vehiculo.id, items: [] }),
      ),
    );
    const numeros = respuestas
      .map((r) => r.body.numero as number)
      .sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(6);
    expect(numeros[5] - numeros[0]).toBe(5);
  });

  it('usuarios: el admin crea un operador, el operador no administra y la baja corta el acceso', async () => {
    const email = `operador-${sufijo}@example.com`;
    const creado = await http
      .post('/api/users')
      .set('Cookie', cookiesB)
      .send({
        email,
        fullName: 'Operador B',
        password: 'Operador123!',
        role: 'USER',
      })
      .expect(201);
    expect(creado.body.taller.nombre).toContain('Taller B');

    const cookiesOperador = await login(email, 'Operador123!');
    await http
      .get('/api/presupuestos')
      .set('Cookie', cookiesOperador)
      .expect(200);
    await http.get('/api/users').set('Cookie', cookiesOperador).expect(403);
    await http
      .patch('/api/taller')
      .set('Cookie', cookiesOperador)
      .send({ nombre: 'Hackeado' })
      .expect(403);

    await http
      .patch(`/api/users/${creado.body.id}`)
      .set('Cookie', cookiesB)
      .send({ isActive: false })
      .expect(200);
    await http
      .get('/api/presupuestos')
      .set('Cookie', cookiesOperador)
      .expect(401);
    await http
      .post('/api/auth/login')
      .send({ email, password: 'Operador123!' })
      .expect(403);
  });
});
