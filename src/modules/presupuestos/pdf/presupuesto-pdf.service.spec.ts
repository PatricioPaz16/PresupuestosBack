import { writeFileSync } from 'fs';
import type { PresupuestoDocumentoDto } from '../dto/presupuesto.dto';
import { PresupuestoPdfService } from './presupuesto-pdf.service';

/** PNG de 1x1 válido (para probar el logo). */
const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function documentoDePrueba(
  cambios: Partial<PresupuestoDocumentoDto> = {},
): PresupuestoDocumentoDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    numero: 42,
    numeroFormateado: '00042',
    estado: 'enviado',
    fechaEmision: '2026-10-25',
    validezDias: 7,
    validoHasta: '2026-11-01',
    kilometraje: 87500,
    motivoIngreso: 'Ruido en tren delantero al pasar baches',
    diagnostico:
      'Extremo de dirección derecho con juego.\nBujes de parrilla gastados.',
    notasCliente:
      'Se recomienda revisar cubiertas delanteras en el próximo service.',
    descuentoTipo: 'porcentaje',
    descuentoValor: '10.00',
    ivaPorcentaje: '21.00',
    totales: {
      subtotalRepuestos: '120050.00',
      subtotalTrabajos: '83000.00',
      descuentoMonto: '20305.00',
      ivaMonto: '38380.05',
      total: '221125.05',
    },
    taller: {
      nombre: 'Taller Ñandú & Hijos',
      razonSocial: 'Ñandú SRL',
      cuit: '30712345678',
      condicionIva: 'responsable_inscripto',
      direccion: 'Av. Colón 2150',
      localidad: 'Córdoba',
      telefono: '351 422-8800',
      email: 'taller@example.com',
      logoDataUrl: LOGO,
    },
    cliente: {
      nombre: 'María',
      apellido: 'Fernández',
      razonSocial: null,
      telefono: '+5493514441122',
      email: 'maria@example.com',
      documento: '27345678',
    },
    vehiculo: {
      patente: 'AB123CD',
      marca: 'Ford',
      modelo: 'Focus',
      version: '2.0 Titanium',
      anio: 2019,
      color: 'Gris',
      combustible: 'nafta',
    },
    repuestos: [
      {
        descripcion: 'Filtro de aceite — Fram',
        unidad: 'u',
        cantidad: '1.000',
        precioUnitario: '12800.00',
        subtotal: '12800.00',
      },
      {
        descripcion: 'Aceite 10W40 semisintético',
        unidad: 'l',
        cantidad: '4.500',
        precioUnitario: '14500.00',
        subtotal: '65250.00',
      },
      {
        descripcion: 'Extremo de dirección derecho',
        unidad: 'u',
        cantidad: '1.000',
        precioUnitario: '42000.00',
        subtotal: '42000.00',
      },
    ],
    trabajos: [
      {
        descripcion: 'Alineación y balanceo',
        unidad: 'u',
        cantidad: '1.000',
        precioUnitario: '48000.00',
        subtotal: '48000.00',
      },
      {
        descripcion: 'Cambio de extremo de dirección',
        unidad: 'h',
        cantidad: '1.500',
        precioUnitario: '23333.33',
        subtotal: '35000.00',
      },
    ],
    condiciones:
      'Presupuesto válido por 7 días, sujeto a variación de precios de repuestos.',
    leyenda: 'Documento no válido como factura.',
    ...cambios,
  };
}

describe('PDF del presupuesto', () => {
  const servicio = new PresupuestoPdfService();

  it('arma un PDF con logo, acentos y eñes', async () => {
    const pdf = await servicio.generar(documentoDePrueba());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    if (process.env.PDF_SALIDA) writeFileSync(process.env.PDF_SALIDA, pdf);
  });

  it('un logo dañado no impide generar el PDF', async () => {
    const doc = documentoDePrueba();
    doc.taller.logoDataUrl = 'data:image/png;base64,AAAA';
    const pdf = await servicio.generar(doc);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('ignora logos que no son PNG ni JPEG en data URL (no lee archivos ni URLs)', async () => {
    for (const logo of [
      '/etc/passwd',
      'https://example.com/logo.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
    ]) {
      const doc = documentoDePrueba();
      doc.taller.logoDataUrl = logo;
      const pdf = await servicio.generar(doc);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('muchos ítems: varias páginas', async () => {
    const item = documentoDePrueba().repuestos[0];
    const repuestos = Array.from({ length: 70 }, (_, i) => ({
      ...item,
      descripcion: `Repuesto número ${i + 1} con una descripción bastante larga para que ocupe dos renglones en la tabla`,
    }));
    const pdf = await servicio.generar(documentoDePrueba({ repuestos }));
    if (process.env.PDF_SALIDA_LARGO)
      writeFileSync(process.env.PDF_SALIDA_LARGO, pdf);
    expect(
      (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length,
    ).toBeGreaterThan(1);
  });

  it('nombre del archivo', () => {
    expect(servicio.nombreArchivo(documentoDePrueba())).toBe(
      'Presupuesto-00042-AB123CD.pdf',
    );
  });
});
