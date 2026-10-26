import { readFileSync } from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import pdfmake from 'pdfmake';
import type {
  Column,
  Content,
  CustomTableLayout,
  TDocumentDefinitions,
  TableCell,
} from 'pdfmake/interfaces';
import type {
  DocumentoItemDto,
  PresupuestoDocumentoDto,
} from '../dto/presupuesto.dto';
import {
  COMBUSTIBLES,
  CONDICIONES_IVA,
  cantidad,
  cuit,
  documento,
  fecha,
  importe,
  patente,
  porcentaje,
  telefono,
} from './formato';
import { woffATtf } from './woff';

/** A4 en puntos y márgenes de 12 mm, como la hoja de la pantalla. */
const MARGEN = 34;
const ANCHO = 595.28 - MARGEN * 2;
const NEGRO = '#111111';
/** Ancho de un carácter de IBM Plex Mono a 9,5 pt (0,6 em). */
const ANCHO_CARACTER = 5.7;

/** Fuentes IBM Plex (las mismas de la pantalla) desde los paquetes @fontsource. */
const FUENTES: Record<string, string> = {
  'plex-sans-400.ttf':
    '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
  'plex-sans-500.ttf':
    '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff',
  'plex-sans-600.ttf':
    '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
  'plex-mono-400.ttf':
    '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff',
  'plex-mono-500.ttf':
    '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff',
};

/** Solo se aceptan logos PNG o JPEG guardados como data URL (lo que guarda Configuración). */
const LOGO_VALIDO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

interface SistemaDeArchivos {
  writeFileSync(nombre: string, datos: Buffer): void;
}

/**
 * Arma el PDF del presupuesto en el servidor, con el mismo diseño que la hoja A4 de la
 * pantalla. Recibe el DTO público (/documento): nunca ve costos, proveedores ni notas
 * internas. pdfmake no puede leer archivos ni bajar nada de internet: las fuentes van en
 * memoria y el logo como data URL.
 */
@Injectable()
export class PresupuestoPdfService {
  private readonly logger = new Logger(PresupuestoPdfService.name);

  constructor() {
    const vfs = (pdfmake as unknown as { virtualfs: SistemaDeArchivos })
      .virtualfs;
    for (const [nombre, paquete] of Object.entries(FUENTES)) {
      vfs.writeFileSync(
        nombre,
        woffATtf(readFileSync(require.resolve(paquete))),
      );
    }
    pdfmake.setFonts({
      Plex: {
        normal: 'plex-sans-400.ttf',
        bold: 'plex-sans-600.ttf',
        italics: 'plex-sans-400.ttf',
        bolditalics: 'plex-sans-600.ttf',
      },
      PlexMedio: {
        normal: 'plex-sans-500.ttf',
        bold: 'plex-sans-600.ttf',
        italics: 'plex-sans-500.ttf',
        bolditalics: 'plex-sans-600.ttf',
      },
      PlexMono: {
        normal: 'plex-mono-400.ttf',
        bold: 'plex-mono-500.ttf',
        italics: 'plex-mono-400.ttf',
        bolditalics: 'plex-mono-500.ttf',
      },
    });
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
  }

  /** Nombre sugerido del archivo: "Presupuesto-00042-AB123CD.pdf". */
  nombreArchivo(doc: PresupuestoDocumentoDto): string {
    return `Presupuesto-${doc.numeroFormateado}-${doc.vehiculo.patente}.pdf`;
  }

  async generar(doc: PresupuestoDocumentoDto): Promise<Buffer> {
    const conLogo =
      !!doc.taller.logoDataUrl && LOGO_VALIDO.test(doc.taller.logoDataUrl);
    try {
      return await pdfmake.createPdf(this.definicion(doc, conLogo)).getBuffer();
    } catch (error) {
      if (!conLogo) throw error;
      // Un logo dañado no tiene que impedir mandar el presupuesto.
      this.logger.warn(
        `No se pudo usar el logo del taller en el PDF: ${String(error)}`,
      );
      return pdfmake.createPdf(this.definicion(doc, false)).getBuffer();
    }
  }

  // ---------------------------------------------------------------------------------

  private definicion(
    doc: PresupuestoDocumentoDto,
    conLogo: boolean,
  ): TDocumentDefinitions {
    return {
      pageSize: 'A4',
      pageMargins: [MARGEN, MARGEN, MARGEN, 42],
      info: {
        title: `Presupuesto ${doc.numeroFormateado} - ${doc.vehiculo.patente} - ${doc.taller.nombre}`,
        author: doc.taller.nombre,
        subject: 'Presupuesto',
        creator: 'Presupuestos de Taller',
      },
      defaultStyle: {
        font: 'Plex',
        fontSize: 9.5,
        lineHeight: 1.25,
        color: NEGRO,
      },
      styles: {
        rotulo: {
          fontSize: 7,
          bold: true,
          characterSpacing: 0.7,
          color: '#555555',
        },
        secundario: { color: '#444444' },
        destacado: { fontSize: 11, bold: true },
        num: { font: 'PlexMono' },
        th: {
          fontSize: 7,
          bold: true,
          characterSpacing: 0.55,
          color: '#444444',
        },
      },
      images: conLogo ? { logo: doc.taller.logoDataUrl! } : undefined,
      footer: (pagina: number, total: number): Content => ({
        text: `Página ${pagina} de ${total}`,
        alignment: 'right',
        fontSize: 7,
        color: '#666666',
        margin: [MARGEN, 14, MARGEN, 0],
      }),
      content: [
        this.encabezado(doc, conLogo),
        this.partes(doc),
        ...this.ingreso(doc),
        ...this.tablas(doc),
        this.cierre(doc),
        this.pie(doc),
      ],
    };
  }

  private encabezado(doc: PresupuestoDocumentoDto, conLogo: boolean): Content {
    const t = doc.taller;
    const lineas = [
      [
        t.razonSocial,
        t.cuit ? `CUIT ${cuit(t.cuit)}` : null,
        CONDICIONES_IVA[t.condicionIva],
      ]
        .filter(Boolean)
        .join(' · '),
      [t.direccion, t.localidad].filter(Boolean).join(', '),
      [t.telefono ? `Tel. ${t.telefono}` : null, t.email]
        .filter(Boolean)
        .join(' · '),
    ].filter(Boolean);

    const datosTaller: Content = {
      stack: [
        {
          text: t.nombre,
          fontSize: 14,
          bold: true,
          lineHeight: 1.1,
          margin: [0, 0, 0, 3],
        },
        ...lineas.map((linea) => ({
          text: linea,
          fontSize: 8.5,
          style: 'secundario',
        })),
      ],
    };

    const logo: Column = {
      width: 'auto',
      stack: [{ image: 'logo', fit: [96, 57] }],
    };
    const taller: Column = {
      width: '*',
      columns: conLogo ? [logo, datosTaller] : [datosTaller],
      columnGap: 11,
    };
    const identificacion: Column = {
      width: 'auto',
      alignment: 'right',
      stack: [
        {
          text: 'PRESUPUESTO',
          fontSize: 8,
          bold: true,
          characterSpacing: 1.4,
        },
        {
          text: `N.º ${doc.numeroFormateado}`,
          font: 'PlexMono',
          bold: true,
          fontSize: 18,
          lineHeight: 1.1,
          margin: [0, 1, 0, 5],
        },
        {
          layout: 'noBorders',
          table: {
            body: [
              this.filaFecha('Fecha', doc.fechaEmision),
              this.filaFecha('Válido hasta', doc.validoHasta),
            ],
          },
        },
      ],
    };

    return {
      stack: [
        { columns: [taller, identificacion], columnGap: 22 },
        this.linea(1.5, NEGRO, [0, 11, 0, 0]),
      ],
    };
  }

  private filaFecha(etiqueta: string, valor: string): TableCell[] {
    return [
      { text: etiqueta, fontSize: 8.5, color: '#555555', margin: [8, 0, 0, 0] },
      { text: fecha(valor), fontSize: 8.5, style: 'num', margin: [6, 0, 0, 0] },
    ];
  }

  private partes(doc: PresupuestoDocumentoDto): Content {
    const c = doc.cliente;
    const persona = [c.nombre, c.apellido].filter(Boolean).join(' ');
    const cliente: Content[] = [
      { text: 'CLIENTE', style: 'rotulo', margin: [0, 0, 0, 3] },
      { text: c.razonSocial ?? persona, style: 'destacado' },
    ];
    if (c.razonSocial) cliente.push({ text: persona });
    if (c.telefono) {
      cliente.push({
        text: [{ text: 'Tel. ' }, { text: telefono(c.telefono), style: 'num' }],
        style: 'secundario',
      });
    }
    if (c.email) cliente.push({ text: c.email, style: 'secundario' });
    if (c.documento)
      cliente.push({ text: documento(c.documento), style: 'secundario' });

    const v = doc.vehiculo;
    const detalle = [
      v.anio ? `Año ${v.anio}` : null,
      v.color,
      v.combustible && COMBUSTIBLES[v.combustible],
    ]
      .filter(Boolean)
      .join(' · ');
    const vehiculo: Content[] = [
      { text: 'VEHÍCULO', style: 'rotulo', margin: [0, 0, 0, 3] },
      {
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => NEGRO,
          vLineColor: () => NEGRO,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 1,
          paddingBottom: () => 0,
        },
        table: {
          body: [
            [
              {
                text: patente(v.patente),
                font: 'PlexMono',
                bold: true,
                fontSize: 11.5,
                characterSpacing: 0.9,
              },
            ],
          ],
        },
        margin: [0, 0, 0, 3],
      },
      {
        text: [v.marca, v.modelo, v.version].filter(Boolean).join(' '),
        style: 'destacado',
      },
    ];
    if (detalle) vehiculo.push({ text: detalle, style: 'secundario' });
    if (doc.kilometraje !== null) {
      vehiculo.push({
        text: [
          { text: 'Kilometraje: ' },
          {
            text: `${doc.kilometraje.toLocaleString('es-AR')} km`,
            style: 'num',
          },
        ],
        style: 'secundario',
      });
    }

    const bordes: CustomTableLayout = {
      hLineWidth: (i) => (i === 1 ? 0.75 : 0),
      hLineColor: () => '#999999',
      vLineWidth: (i) => (i === 1 ? 0.75 : 0),
      vLineColor: () => '#cccccc',
      paddingLeft: (i) => (i === 0 ? 0 : 17),
      paddingRight: (i) => (i === 0 ? 10 : 0),
      paddingTop: () => 10,
      paddingBottom: () => 10,
    };
    return {
      layout: bordes,
      table: {
        widths: ['*', '*'],
        body: [[{ stack: cliente }, { stack: vehiculo }]],
      },
    };
  }

  private ingreso(doc: PresupuestoDocumentoDto): Content[] {
    if (!doc.motivoIngreso && !doc.diagnostico) return [];
    const bloque = (rotulo: string, texto: string | null): Content => ({
      stack: [
        { text: rotulo, style: 'rotulo', margin: [0, 0, 0, 3] },
        { text: texto || '—' },
      ],
    });
    return [
      {
        columns: [
          bloque('MOTIVO DE INGRESO', doc.motivoIngreso),
          bloque('DIAGNÓSTICO', doc.diagnostico),
        ],
        columnGap: 17,
        margin: [0, 10, 0, 10],
      },
      this.linea(0.75, '#999999'),
    ];
  }

  private tablas(doc: PresupuestoDocumentoDto): Content[] {
    const secciones: Array<[string, DocumentoItemDto[], string]> = [
      ['Repuestos', doc.repuestos, doc.totales.subtotalRepuestos],
      ['Mano de obra', doc.trabajos, doc.totales.subtotalTrabajos],
    ];
    // Columnas numéricas iguales en las dos tablas y con lugar para el importe más largo
    // (la monoespaciada mide 0,6 em por carácter).
    const items = [...doc.repuestos, ...doc.trabajos];
    const largo = (textos: string[]) =>
      Math.max(0, ...textos.map((t) => t.length));
    const anchoCantidad = Math.max(
      50,
      largo(items.map((i) => cantidad(i.cantidad, i.unidad))) * ANCHO_CARACTER +
        10,
    );
    const anchoImporte = Math.max(
      85,
      largo([
        ...items.flatMap((i) => [
          importe(i.precioUnitario),
          importe(i.subtotal),
        ]),
        importe(doc.totales.subtotalRepuestos),
        importe(doc.totales.subtotalTrabajos),
      ]) *
        ANCHO_CARACTER +
        10,
    );
    return secciones
      .filter(([, filas]) => filas.length > 0)
      .map(([titulo, filas, subtotal]) =>
        this.tabla(titulo, filas, subtotal, [anchoCantidad, anchoImporte]),
      );
  }

  private tabla(
    titulo: string,
    items: DocumentoItemDto[],
    subtotal: string,
    [anchoCantidad, anchoImporte]: [number, number],
  ): Content {
    const derecha = { alignment: 'right' as const };
    const encabezado: TableCell[] = [
      { text: titulo.toUpperCase(), style: 'th' },
      { text: 'CANT.', style: 'th', ...derecha },
      { text: 'PRECIO UNIT.', style: 'th', ...derecha },
      { text: 'SUBTOTAL', style: 'th', ...derecha },
    ];
    const filas: TableCell[][] = items.map((item) => [
      { text: item.descripcion },
      {
        text: cantidad(item.cantidad, item.unidad),
        style: 'num',
        noWrap: true,
        ...derecha,
      },
      {
        text: importe(item.precioUnitario),
        style: 'num',
        noWrap: true,
        ...derecha,
      },
      { text: importe(item.subtotal), style: 'num', noWrap: true, ...derecha },
    ]);
    const pie: TableCell[] = [
      {
        text: `Subtotal ${titulo.toLowerCase()}`,
        bold: true,
        colSpan: 3,
        ...derecha,
      },
      {},
      {},
      {
        text: importe(subtotal),
        style: 'num',
        bold: true,
        noWrap: true,
        ...derecha,
      },
    ];
    const total = filas.length + 2;
    return {
      margin: [0, 13, 0, 0],
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', anchoCantidad, anchoImporte, anchoImporte],
        body: [encabezado, ...filas, pie],
      },
      layout: {
        hLineWidth: (i) => (i === 1 ? 0.75 : i > 1 && i < total - 1 ? 0.5 : 0),
        hLineColor: (i) => (i === 1 ? NEGRO : '#d4d4d4'),
        vLineWidth: () => 0,
        paddingLeft: () => 4.25,
        paddingRight: () => 4.25,
        paddingTop: (i) => (i === total - 1 ? 5 : 4),
        paddingBottom: () => 4,
      },
    };
  }

  private cierre(doc: PresupuestoDocumentoDto): Content {
    const t = doc.totales;
    const fila = (etiqueta: string, valor: string): TableCell[] => [
      { text: etiqueta },
      { text: valor, style: 'num', alignment: 'right', noWrap: true },
    ];
    const filas: TableCell[][] = [
      fila(
        'Subtotal',
        importe(this.sumar(t.subtotalRepuestos, t.subtotalTrabajos)),
      ),
    ];
    if (t.descuentoMonto !== '0.00') {
      const etiqueta =
        doc.descuentoTipo === 'porcentaje'
          ? `Descuento ${porcentaje(doc.descuentoValor)}%`
          : 'Descuento';
      filas.push(fila(etiqueta, `- ${importe(t.descuentoMonto)}`));
    }
    if (Number(doc.ivaPorcentaje) > 0) {
      filas.push(
        fila(`IVA ${porcentaje(doc.ivaPorcentaje)}%`, importe(t.ivaMonto)),
      );
    }
    const total = importe(t.total);
    // El total va grande; si el número es muy largo se achica para que entre en el recuadro.
    const tamanoTotal =
      total.length <= 13 ? 16 : total.length <= 16 ? 13.5 : 11.5;

    return {
      unbreakable: true,
      margin: [0, 17, 0, 0],
      columns: [
        {
          width: '*',
          stack: doc.notasCliente
            ? [
                {
                  text: 'OBSERVACIONES',
                  style: 'rotulo',
                  margin: [0, 0, 0, 3],
                },
                { text: doc.notasCliente },
              ]
            : [],
        },
        {
          width: 204,
          stack: [
            {
              layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 3,
                paddingBottom: () => 3,
              },
              table: { widths: ['*', 'auto'], body: filas },
            },
            {
              margin: [0, 4, 0, 0],
              layout: {
                hLineWidth: () => 1.25,
                vLineWidth: (i) => (i === 1 ? 0 : 1.25),
                hLineColor: () => NEGRO,
                vLineColor: () => NEGRO,
                paddingLeft: () => 7,
                paddingRight: () => 7,
                paddingTop: () => 6,
                paddingBottom: () => 5,
              },
              table: {
                widths: ['auto', '*'],
                body: [
                  [
                    {
                      text: 'TOTAL',
                      fontSize: 9,
                      bold: true,
                      characterSpacing: 0.9,
                      margin: [0, 5, 0, 0],
                    },
                    {
                      text: total,
                      font: 'PlexMono',
                      bold: true,
                      fontSize: tamanoTotal,
                      alignment: 'right',
                      noWrap: true,
                    },
                  ],
                ],
              },
            },
          ],
        },
      ],
      columnGap: 23,
    };
  }

  private pie(doc: PresupuestoDocumentoDto): Content {
    const ancho = (ANCHO - 45) / 2;
    const firma = (texto: string): Column => ({
      width: ancho,
      stack: [
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: ancho, y2: 0, lineWidth: 0.75 },
          ],
        },
        { text: texto, fontSize: 7.5, color: '#555555', margin: [0, 4, 0, 0] },
      ],
    });
    const textos: Content[] = [
      { text: doc.condiciones, fontSize: 8.5, color: '#333333' },
    ];
    if (
      Number(doc.ivaPorcentaje) === 0 &&
      doc.taller.condicionIva === 'responsable_inscripto'
    ) {
      textos.push({
        text: 'Precios con IVA incluido.',
        fontSize: 8.5,
        color: '#333333',
      });
    }
    textos.push({
      text: doc.leyenda,
      fontSize: 8.5,
      bold: true,
      color: '#333333',
    });

    return {
      unbreakable: true,
      margin: [0, 23, 0, 0],
      stack: [
        this.linea(0.75, '#999999', [0, 0, 0, 8]),
        ...textos,
        {
          columns: [
            firma('Conformidad del cliente'),
            firma('Aclaración y fecha'),
          ],
          columnGap: 45,
          margin: [0, 45, 0, 0],
        },
      ],
    };
  }

  private linea(
    grosor: number,
    color: string,
    margen: [number, number, number, number] = [0, 0, 0, 0],
  ): Content {
    return {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: ANCHO,
          y2: 0,
          lineWidth: grosor,
          lineColor: color,
        },
      ],
      margin: margen,
    };
  }

  /** Suma de importes decimales como texto ("120050.00" + "83000.00"), sin coma flotante. */
  private sumar(a: string, b: string): string {
    const centavos = (valor: string) => {
      const [entero, decimales = ''] = valor.split('.');
      return BigInt(entero) * 100n + BigInt((decimales + '00').slice(0, 2));
    };
    const total = centavos(a) + centavos(b);
    return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
  }
}
