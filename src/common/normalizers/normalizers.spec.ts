import { esPatenteValida, formatoPatente, normalizarPatente } from './patente';
import { normalizarTelefono, TelefonoInvalidoError } from './telefono';

describe('normalizarPatente', () => {
  it.each([
    ['ab-123 cd', 'AB123CD'],
    ['  abc 123 ', 'ABC123'],
    ['A.123.BCD', 'A123BCD'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarPatente(entrada)).toBe(esperado);
  });

  it('reconoce los formatos argentinos', () => {
    expect(formatoPatente('AB123CD')).toBe('mercosur');
    expect(formatoPatente('A123BCD')).toBe('mercosur_moto');
    expect(formatoPatente('ABC123')).toBe('anterior');
    expect(formatoPatente('123ABC')).toBe('moto_anterior');
    expect(formatoPatente('B1234567')).toBe('otro');
  });

  it('acepta entre 5 y 10 caracteres alfanuméricos', () => {
    expect(esPatenteValida('ABC12')).toBe(true);
    expect(esPatenteValida('AB12')).toBe(false);
    expect(esPatenteValida('ABCDEFGHIJK')).toBe(false);
  });
});

describe('normalizarTelefono', () => {
  it.each([
    ['011 15 2345-6789', '+5491123456789'],
    ['11 2345 6789', '+5491123456789'],
    ['1123456789', '+5491123456789'],
    ['+54 9 11 2345 6789', '+5491123456789'],
    ['+54 11 2345 6789', '+5491123456789'],
    ['5491123456789', '+5491123456789'],
    ['0351 15-555-1234', '+5493515551234'],
    ['351 555 1234', '+5493515551234'],
    ['(02954) 15 45-6789', '+5492954456789'],
    ['+54 9 11 15 2345 6789', '+5491123456789'],
    ['+34 612 345 678', '+34612345678'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });

  it('vacío -> null', () => {
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono('   ')).toBeNull();
    expect(normalizarTelefono(undefined)).toBeNull();
  });

  it.each(['15 2345 6789', '4567-8901', '123', '+1 23'])(
    'rechaza %s',
    (entrada) => {
      expect(() => normalizarTelefono(entrada)).toThrow(TelefonoInvalidoError);
    },
  );
});
