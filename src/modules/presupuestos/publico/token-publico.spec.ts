import {
  armarTokenPublico,
  leerTokenPublico,
  nuevaParteAleatoria,
} from './token-publico';

describe('token del enlace público', () => {
  const tallerId = '3f0b2c4e-9a1d-4e7f-8b6a-0c5d2e9f1a7b';

  it('lleva el taller adentro y se puede leer de vuelta', () => {
    const aleatorio = nuevaParteAleatoria();
    expect(aleatorio).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const token = armarTokenPublico(tallerId, aleatorio);
    expect(token).toHaveLength(54);
    expect(leerTokenPublico(token)).toEqual({ tallerId, aleatorio });
  });

  it('cada enlace es distinto', () => {
    expect(nuevaParteAleatoria()).not.toBe(nuevaParteAleatoria());
  });

  it('rechaza tokens mal formados', () => {
    const valido = armarTokenPublico(tallerId, nuevaParteAleatoria());
    for (const malo of [
      '',
      valido.slice(1),
      `${valido}x`,
      `${valido.slice(0, 53)}=`,
      `${valido.slice(0, 53)}/`,
      '../../etc/passwd',
    ]) {
      expect(leerTokenPublico(malo)).toBeNull();
    }
  });
});
