import { inflateSync } from 'zlib';

/**
 * WOFF 1.0 -> TrueType/OpenType: descomprime cada tabla y arma el directorio sfnt.
 *
 * Las fuentes vienen de los paquetes @fontsource (los mismos que usa la pantalla), que
 * solo traen WOFF/WOFF2. La librería que lee fuentes del PDF (fontkit) falla con algunas
 * de esas WOFF (por ejemplo IBM Plex Mono); con la fuente ya convertida a TTF funciona.
 */
export function woffATtf(woff: Buffer): Buffer {
  if (woff.length < 44 || woff.readUInt32BE(0) !== 0x774f4646) {
    throw new Error('El archivo no es una fuente WOFF 1.0.');
  }
  const flavor = woff.readUInt32BE(4);
  const cantidad = woff.readUInt16BE(12);

  const tablas: Array<{ tag: number; checksum: number; datos: Buffer }> = [];
  for (let i = 0; i < cantidad; i++) {
    const base = 44 + i * 20;
    const tag = woff.readUInt32BE(base);
    const desde = woff.readUInt32BE(base + 4);
    const largoComprimido = woff.readUInt32BE(base + 8);
    const largoOriginal = woff.readUInt32BE(base + 12);
    const checksum = woff.readUInt32BE(base + 16);
    const crudo = woff.subarray(desde, desde + largoComprimido);
    const datos =
      largoComprimido < largoOriginal ? inflateSync(crudo) : Buffer.from(crudo);
    if (datos.length !== largoOriginal) {
      throw new Error('Fuente WOFF dañada (largo de tabla inesperado).');
    }
    tablas.push({ tag, checksum, datos });
  }
  tablas.sort((a, b) => a.tag - b.tag);

  let potencia = 1;
  let exponente = 0;
  while (potencia * 2 <= cantidad) {
    potencia *= 2;
    exponente++;
  }
  const directorio = Buffer.alloc(12 + cantidad * 16);
  directorio.writeUInt32BE(flavor, 0);
  directorio.writeUInt16BE(cantidad, 4);
  directorio.writeUInt16BE(potencia * 16, 6);
  directorio.writeUInt16BE(exponente, 8);
  directorio.writeUInt16BE(cantidad * 16 - potencia * 16, 10);

  const partes: Buffer[] = [directorio];
  let posicion = directorio.length;
  tablas.forEach((tabla, i) => {
    const registro = 12 + i * 16;
    directorio.writeUInt32BE(tabla.tag, registro);
    directorio.writeUInt32BE(tabla.checksum, registro + 4);
    directorio.writeUInt32BE(posicion, registro + 8);
    directorio.writeUInt32BE(tabla.datos.length, registro + 12);
    const relleno = (4 - (tabla.datos.length % 4)) % 4;
    partes.push(tabla.datos, Buffer.alloc(relleno));
    posicion += tabla.datos.length + relleno;
  });
  return Buffer.concat(partes);
}
