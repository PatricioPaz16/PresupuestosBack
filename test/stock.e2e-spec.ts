import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomInt } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { TalleresService } from '../src/modules/talleres/talleres.service';

/**
 * Stock de repuestos contra PostgreSQL real: alta con stock inicial, ingresos, conteos,
 * descuento al aprobar presupuestos, historial y aislamiento entre talleres.
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

interface Item {
  id: string;
  controlaStock: boolean;
  stock: string;
  stockMinimo: string | null;
  ubicacion: string | null;
  costoReferencia: string | null;
  precioReferencia: string;
}

interface Movimiento {
  tipo: string;
  cantidad: string;
  stockResultante: string;
  costoUnitario: string | null;
  proveedor: string | null;
  comprobante: string | null;
  nota: string | null;
  presupuesto: { id: string; numero: number } | null;
  usuarioNombre: string | null;
}

describe('Stock (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let cookiesA: string;
  let cookiesB: string;

  const sufijo = `${Date.now()}${randomInt(1000)}`;
  const passwordB = 'TallerB123!';
  const emailB = `admin-stock-b-${sufijo}@example.com`;

  async function login(email: string, password: string): Promise<string> {
    const respuesta = await http
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return cookiesDe(respuesta.headers['set-cookie']);
  }

  async function crearRepuesto(datos: Record<string, unknown>): Promise<Item> {
    const respuesta = await http
      .post('/api/catalogo')
      .set('Cookie', cookiesA)
      .send({
        tipo: 'repuesto',
        unidad: 'u',
        precioReferencia: '1000.00',
        ...datos,
      })
      .expect(201);
    return respuesta.body as Item;
  }

  async function leer(id: string, q: string): Promise<Item | undefined> {
    const respuesta = await http
      .get('/api/catalogo')
      .query({ tipo: 'repuesto', q, incluirInactivos: true })
      .set('Cookie', cookiesA)
      .expect(200);
    return (respuesta.body.items as Item[]).find((i) => i.id === id);
  }

  async function movimientos(id: string): Promise<Movimiento[]> {
    const respuesta = await http
      .get(`/api/catalogo/${id}/stock/movimientos`)
      .set('Cookie', cookiesA)
      .expect(200);
    return respuesta.body.items as Movimiento[];
  }

  async function presupuestoCon(items: Array<Record<string, unknown>>) {
    const vehiculo = await http
      .post('/api/vehiculos')
      .set('Cookie', cookiesA)
      .send({
        patente: patenteAleatoria(),
        marca: 'Fiat',
        modelo: 'Palio',
        cliente: { nombre: 'Cliente stock' },
      })
      .expect(201);
    const creado = await http
      .post('/api/presupuestos')
      .set('Cookie', cookiesA)
      .send({ vehiculoId: vehiculo.body.id, items })
      .expect(201);
    return creado.body as {
      id: string;
      numero: number;
      items: Array<{ stock: { actual: string; unidad: string } | null }>;
    };
  }

  async function aprobar(id: string) {
    const respuesta = await http
      .patch(`/api/presupuestos/${id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'aprobado' })
      .expect(200);
    return respuesta.body as { estado: string; stockDescontado: number };
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
      nombre: `Taller stock B ${sufijo}`,
      adminEmail: emailB,
      adminNombre: 'Admin B',
      adminPassword: passwordB,
    });
    cookiesB = await login(emailB, passwordB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('alta con stock inicial, ingreso (actualiza costo y precio), conteo e historial', async () => {
    const nombre = `Filtro stock ${sufijo}`;
    const item = await crearRepuesto({
      nombre,
      costoReferencia: '700.00',
      stockInicial: '5',
      stockMinimo: '2',
      ubicacion: 'Estante A1',
    });
    expect(item.controlaStock).toBe(true);
    expect(item.stock).toBe('5.000');
    expect(item.stockMinimo).toBe('2.000');
    expect(item.ubicacion).toBe('Estante A1');

    const ingreso = await http
      .post(`/api/catalogo/${item.id}/stock/ingresos`)
      .set('Cookie', cookiesA)
      .send({
        cantidad: '3',
        costoUnitario: '800.00',
        precioVenta: '1150.00',
        proveedor: 'Repuestera Sur',
        comprobante: 'FC A 0001-00000123',
      })
      .expect(200);
    expect(ingreso.body.stock).toBe('8.000');
    expect(ingreso.body.costoReferencia).toBe('800.00');
    expect(ingreso.body.precioReferencia).toBe('1150.00');

    const conteo = await http
      .post(`/api/catalogo/${item.id}/stock/ajustes`)
      .set('Cookie', cookiesA)
      .send({ stockReal: '7.5' })
      .expect(200);
    expect(conteo.body.stock).toBe('7.500');

    // Contar lo mismo que ya hay no agrega movimientos.
    await http
      .post(`/api/catalogo/${item.id}/stock/ajustes`)
      .set('Cookie', cookiesA)
      .send({ stockReal: '7.5' })
      .expect(200);

    const historial = await movimientos(item.id);
    expect(
      historial.map((m) => [m.tipo, m.cantidad, m.stockResultante]),
    ).toEqual([
      ['ajuste', '-0.500', '7.500'],
      ['ingreso', '3.000', '8.000'],
      ['ajuste', '5.000', '5.000'],
    ]);
    expect(historial[0].nota).toBe('Conteo');
    expect(historial[1]).toMatchObject({
      costoUnitario: '800.00',
      proveedor: 'Repuestera Sur',
      comprobante: 'FC A 0001-00000123',
    });
    expect(historial[2].nota).toBe('Stock inicial');
    expect(historial.every((m) => m.usuarioNombre)).toBe(true);

    // El stock no se cambia editando el ítem (el campo ni existe en el PATCH).
    await http
      .patch(`/api/catalogo/${item.id}`)
      .set('Cookie', cookiesA)
      .send({ stock: '100' })
      .expect(400);

    const resumen = await http
      .get('/api/catalogo/stock/resumen')
      .set('Cookie', cookiesA)
      .expect(200);
    expect(resumen.body.repuestos).toBeGreaterThanOrEqual(1);
    expect(Number(resumen.body.valorCosto)).toBeGreaterThanOrEqual(7.5 * 800);
  });

  it('aprobar un presupuesto descuenta el stock una sola vez y queda en el historial', async () => {
    const item = await crearRepuesto({
      nombre: `Pastillas stock ${sufijo}`,
      stockInicial: '10',
    });
    const sinStock = await crearRepuesto({
      nombre: `Lámpara sin stock ${sufijo}`,
    });
    expect(sinStock.controlaStock).toBe(false);

    const p = await presupuestoCon([
      {
        tipo: 'repuesto',
        catalogoItemId: item.id,
        descripcion: 'Pastillas',
        cantidad: '2',
        precioUnitario: '1000',
      },
      {
        tipo: 'repuesto',
        catalogoItemId: item.id,
        descripcion: 'Pastillas (otra fila)',
        cantidad: '1',
        precioUnitario: '1000',
      },
      {
        tipo: 'repuesto',
        catalogoItemId: sinStock.id,
        descripcion: 'Lámpara',
        cantidad: '1',
        precioUnitario: '500',
      },
      {
        tipo: 'repuesto',
        descripcion: 'Concepto libre',
        cantidad: '1',
        precioUnitario: '100',
      },
    ]);
    expect(p.items[0].stock).toEqual({ actual: '10.000', unidad: 'u' });
    expect(p.items[2].stock).toBeNull();
    expect(p.items[3].stock).toBeNull();

    const aprobado = await aprobar(p.id);
    expect(aprobado.estado).toBe('aprobado');
    expect(aprobado.stockDescontado).toBe(1);
    expect((await leer(item.id, `Pastillas stock ${sufijo}`))?.stock).toBe(
      '7.000',
    );
    expect(
      (await leer(sinStock.id, `Lámpara sin stock ${sufijo}`))?.stock,
    ).toBe('0.000');

    // Editarlo después no vuelve a descontar (y aprobado no se edita).
    await http
      .patch(`/api/presupuestos/${p.id}/estado`)
      .set('Cookie', cookiesA)
      .send({ estado: 'aprobado' })
      .expect(200);
    expect((await leer(item.id, `Pastillas stock ${sufijo}`))?.stock).toBe(
      '7.000',
    );

    const [ultimo] = await movimientos(item.id);
    expect(ultimo).toMatchObject({
      tipo: 'presupuesto',
      cantidad: '-3.000',
      stockResultante: '7.000',
      presupuesto: { id: p.id, numero: p.numero },
    });
    expect(ultimo.usuarioNombre).toBeTruthy();

    // Sin stock suficiente se aprueba igual: queda negativo y figura como faltante.
    const grande = await presupuestoCon([
      {
        tipo: 'repuesto',
        catalogoItemId: item.id,
        descripcion: 'Pastillas',
        cantidad: '9',
        precioUnitario: '1000',
      },
    ]);
    await aprobar(grande.id);
    const negativo = await leer(item.id, `Pastillas stock ${sufijo}`);
    expect(negativo?.stock).toBe('-2.000');

    const faltantes = await http
      .get('/api/catalogo')
      .query({ stock: 'faltante', q: `Pastillas stock ${sufijo}` })
      .set('Cookie', cookiesA)
      .expect(200);
    expect((faltantes.body.items as Item[]).map((i) => i.id)).toContain(
      item.id,
    );
    const resumen = await http
      .get('/api/catalogo/stock/resumen')
      .set('Cookie', cookiesA)
      .expect(200);
    expect(resumen.body.negativos).toBeGreaterThanOrEqual(1);
  });

  it('filtros del listado y dejar de llevar stock', async () => {
    const nombre = `Correa stock ${sufijo}`;
    const item = await crearRepuesto({ nombre });
    const sinControl = await http
      .get('/api/catalogo')
      .query({ stock: 'sin_control', q: nombre })
      .set('Cookie', cookiesA)
      .expect(200);
    expect((sinControl.body.items as Item[]).map((i) => i.id)).toContain(
      item.id,
    );

    // Un conteo carga el stock inicial y lo pasa a "lleva stock".
    const inicial = await http
      .post(`/api/catalogo/${item.id}/stock/ajustes`)
      .set('Cookie', cookiesA)
      .send({ stockReal: '4' })
      .expect(200);
    expect(inicial.body).toMatchObject({ controlaStock: true, stock: '4.000' });
    expect((await movimientos(item.id))[0].nota).toBe('Stock inicial');

    const controlados = await http
      .get('/api/catalogo')
      .query({ stock: 'controlado', q: nombre, precioViejo: false })
      .set('Cookie', cookiesA)
      .expect(200);
    expect((controlados.body.items as Item[]).map((i) => i.id)).toEqual([
      item.id,
    ]);
    // "precioViejo=false" es falso (antes la query lo tomaba como verdadero).
    const viejos = await http
      .get('/api/catalogo')
      .query({ stock: 'controlado', q: nombre, precioViejo: true })
      .set('Cookie', cookiesA)
      .expect(200);
    expect(viejos.body.items).toEqual([]);

    const apagado = await http
      .patch(`/api/catalogo/${item.id}`)
      .set('Cookie', cookiesA)
      .send({ controlaStock: false })
      .expect(200);
    expect(apagado.body).toMatchObject({
      controlaStock: false,
      stock: '0.000',
    });
    expect((await movimientos(item.id))[0]).toMatchObject({
      tipo: 'ajuste',
      cantidad: '-4.000',
      nota: 'Dejó de llevar stock',
    });
  });

  it('validaciones y aislamiento entre talleres', async () => {
    const item = await crearRepuesto({
      nombre: `Bujía stock ${sufijo}`,
      stockInicial: '2',
    });
    const trabajo = await http
      .post('/api/catalogo')
      .set('Cookie', cookiesA)
      .send({
        tipo: 'trabajo',
        nombre: `Alineado stock ${sufijo}`,
        unidad: 'u',
        precioReferencia: '5000',
      })
      .expect(201);

    await http
      .post(`/api/catalogo/${item.id}/stock/ingresos`)
      .set('Cookie', cookiesA)
      .send({ cantidad: '0' })
      .expect(400);
    await http
      .post(`/api/catalogo/${item.id}/stock/ingresos`)
      .set('Cookie', cookiesA)
      .send({ cantidad: '-1' })
      .expect(400);
    const deTrabajo = await http
      .post(`/api/catalogo/${trabajo.body.id}/stock/ingresos`)
      .set('Cookie', cookiesA)
      .send({ cantidad: '1' })
      .expect(400);
    expect(deTrabajo.body.message).toBe('Solo los repuestos llevan stock.');
    await http
      .patch(`/api/catalogo/${trabajo.body.id}`)
      .set('Cookie', cookiesA)
      .send({ controlaStock: true })
      .expect(400);
    await http
      .post('/api/catalogo')
      .set('Cookie', cookiesA)
      .send({
        tipo: 'trabajo',
        nombre: `Trabajo con stock ${sufijo}`,
        precioReferencia: '1',
        stockInicial: '3',
      })
      .expect(400);

    // Otro taller no ve ni mueve el stock de este.
    await http
      .post(`/api/catalogo/${item.id}/stock/ingresos`)
      .set('Cookie', cookiesB)
      .send({ cantidad: '1' })
      .expect(404);
    await http
      .get(`/api/catalogo/${item.id}/stock/movimientos`)
      .set('Cookie', cookiesB)
      .expect(404);
    const resumenB = await http
      .get('/api/catalogo/stock/resumen')
      .set('Cookie', cookiesB)
      .expect(200);
    expect(resumenB.body).toMatchObject({ repuestos: 0, valorCosto: '0' });

    // Desactivado: no se le mueve stock.
    await http
      .patch(`/api/catalogo/${item.id}`)
      .set('Cookie', cookiesA)
      .send({ activo: false })
      .expect(200);
    await http
      .post(`/api/catalogo/${item.id}/stock/ingresos`)
      .set('Cookie', cookiesA)
      .send({ cantidad: '1' })
      .expect(409);

    // Desactivados: solo con incluirInactivos=true ("false" los deja afuera).
    const buscar = async (incluirInactivos: boolean) =>
      (
        await http
          .get('/api/catalogo')
          .query({ q: `Bujía stock ${sufijo}`, incluirInactivos })
          .set('Cookie', cookiesA)
          .expect(200)
      ).body.items as Item[];
    expect((await buscar(false)).map((i) => i.id)).not.toContain(item.id);
    expect((await buscar(true)).map((i) => i.id)).toContain(item.id);
  });
});
