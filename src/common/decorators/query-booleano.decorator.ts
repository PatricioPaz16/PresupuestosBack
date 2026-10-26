import { Transform } from 'class-transformer';

/**
 * Booleano de query string: solo "true" (o true) es verdadero.
 *
 * Lee el valor original (`obj[key]`) y no `value`: con `enableImplicitConversion`,
 * class-transformer ya convirtió "false" en `true` (Boolean("false")) antes de llegar acá.
 */
export function QueryBooleano(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const original = (obj as Record<string, unknown>)[key];
    return original === true || original === 'true';
  });
}
