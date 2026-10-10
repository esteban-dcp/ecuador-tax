import { describe, expect, it } from 'vitest';
import { Ambiente, TipoComprobante } from '@ecuador-tax/core';
import { computeCheckDigit, generateAccessKey, isValidAccessKey, parseAccessKey } from '@ecuador-tax/access-key';

// Vector calculado de forma independiente (Python) siguiendo la ficha técnica: módulo 11, factores 2..7.
const VECTOR = '1010202601179001691900110010010000000011234567811';
const base = {
  fechaEmision: new Date(2026, 9, 10),
  tipoComprobante: TipoComprobante.Factura,
  ruc: '1790016919001',
  ambiente: Ambiente.Pruebas,
  establecimiento: '001',
  puntoEmision: '001',
  secuencial: '000000001',
  codigoNumerico: '12345678',
} as const;

describe('generateAccessKey', () => {
  it('coincide con el vector de referencia', () => {
    const r = generateAccessKey(base);
    expect(r.ok && r.value).toBe(VECTOR);
    expect(VECTOR).toHaveLength(49);
  });
  it('genera código numérico aleatorio válido cuando se omite', () => {
    const { codigoNumerico: _omit, ...rest } = base;
    const a = generateAccessKey(rest);
    expect(a.ok && isValidAccessKey(a.value)).toBe(true);
  });
  it('rechaza campos mal formados', () => {
    expect(generateAccessKey({ ...base, ruc: '123' }).ok).toBe(false);
    expect(generateAccessKey({ ...base, secuencial: '1' }).ok).toBe(false);
    expect(generateAccessKey({ ...base, establecimiento: '1a1' }).ok).toBe(false);
    expect(generateAccessKey({ ...base, fechaEmision: new Date('x') }).ok).toBe(false);
    expect(generateAccessKey({ ...base, ambiente: '3' as never }).ok).toBe(false);
    expect(generateAccessKey({ ...base, tipoComprobante: '02' as never }).ok).toBe(false);
  });
});

describe('computeCheckDigit', () => {
  it('mapea 11 -> 0 y 10 -> 1', () => {
    // Suma múltiplo de 11 => 11-0 = 11 => 0. "0…0" (todo ceros) => suma 0.
    expect(computeCheckDigit('0'.repeat(48))).toBe('0');
    // "0…01": el dígito de más a la derecha tiene factor 2 => suma 2 => 11-2=9
    expect(computeCheckDigit('0'.repeat(47) + '1')).toBe('9');
    // factor 3 en la penúltima posición, suma 3*... => buscamos suma%11==1 => dv 10 => 1: dígito derecha=… 
    // posición derecha (factor 2) = 6 => 12 % 11 = 1 => 10 => 1
    expect(computeCheckDigit('0'.repeat(47) + '6')).toBe('1');
  });
});

describe('parseAccessKey', () => {
  it('descompone una clave válida', () => {
    const r = parseAccessKey(VECTOR);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        fecha: '10102026',
        tipoComprobante: '01',
        ruc: '1790016919001',
        ambiente: '1',
        establecimiento: '001',
        puntoEmision: '001',
        secuencial: '000000001',
        codigoNumerico: '12345678',
        tipoEmision: '1',
        digitoVerificador: '1',
      });
    }
  });
  it('detecta errores', () => {
    const code = (s: string) => {
      const r = parseAccessKey(s);
      return r.ok ? 'OK' : r.error.code;
    };
    expect(code(VECTOR.slice(1))).toBe('ACCESS_KEY_FORMAT');
    expect(code(VECTOR.slice(0, 48) + '2')).toBe('ACCESS_KEY_CHECK_DIGIT');
    expect(code('3002202601' + VECTOR.slice(10))).toBe('ACCESS_KEY_DATE');
    // Tipo de comprobante desconocido (02), con DV recalculado para aislar la causa.
    const body = VECTOR.slice(0, 8) + '02' + VECTOR.slice(10, 48);
    expect(code(body + computeCheckDigit(body))).toBe('ACCESS_KEY_DOC_TYPE');
  });
  it('round-trip generate -> parse', () => {
    for (const tipo of Object.values(TipoComprobante)) {
      const k = generateAccessKey({ ...base, tipoComprobante: tipo });
      expect(k.ok).toBe(true);
      if (k.ok) {
        const p = parseAccessKey(k.value);
        expect(p.ok && p.value.tipoComprobante).toBe(tipo);
      }
    }
  });
});
