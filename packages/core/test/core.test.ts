import { describe, expect, it } from 'vitest';
import { EcuadorTaxError, TransportError, ValidationError, err, formatDecimal, formatFechaSri, ok, parseFechaSri, unwrap } from '@ecuador-tax/core';

describe('formatDecimal', () => {
  it.each([
    ['1', 2, '1.00'],
    ['1.005', 2, '1.01'],
    ['1.004', 2, '1.00'],
    ['0.125', 2, '0.13'],
    ['-1.005', 2, '-1.01'],
    ['-0.001', 2, '0.00'],
    ['12.5', 0, '13'],
    ['0', 6, '0.000000'],
    ['9.999', 2, '10.00'],
  ])('%s con %i decimales -> %s', (i, d, o) => expect(formatDecimal(i, d)).toBe(o));
  it('evita errores de coma flotante', () => expect(formatDecimal(1.005, 2)).toBe('1.01'));
  it('rechaza formatos inválidos', () => {
    expect(() => formatDecimal('abc', 2)).toThrow(ValidationError);
    expect(() => formatDecimal(Number.NaN, 2)).toThrow(ValidationError);
    expect(() => formatDecimal('1', -1)).toThrow(ValidationError);
  });
});

describe('fechas', () => {
  it('formatea y parsea dd/mm/aaaa', () => {
    expect(formatFechaSri(new Date(2026, 0, 5))).toBe('05/01/2026');
    expect(parseFechaSri('29/02/2024').getDate()).toBe(29);
  });
  it('rechaza fechas inexistentes', () => {
    expect(() => parseFechaSri('29/02/2025')).toThrow(ValidationError);
    expect(() => parseFechaSri('2025-01-01')).toThrow(ValidationError);
  });
});

describe('errores y result', () => {
  it('conservan kind/code/cause', () => {
    const cause = new Error('x');
    const e = new TransportError('TIMEOUT', 'tiempo agotado', { cause, ambiguous: true });
    expect(e).toBeInstanceOf(EcuadorTaxError);
    expect(e.kind).toBe('transport');
    expect(e.ambiguous).toBe(true);
    expect(e.cause).toBe(cause);
    expect(e.name).toBe('TransportError');
  });
  it('unwrap', () => {
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap(err(new ValidationError('X', 'm')))).toThrow('m');
  });
});
