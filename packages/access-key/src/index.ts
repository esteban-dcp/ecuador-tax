import {
  ValidationError,
  err,
  isAmbiente,
  isTipoComprobante,
  ok,
  type Ambiente,
  type Result,
  type TipoComprobante,
  TipoEmision,
} from '@ecuador-tax/core';

/**
 * Clave de acceso (49 dígitos), según la ficha técnica de comprobantes electrónicos:
 *
 *  fecha(8 ddmmaaaa) | tipoComprobante(2) | ruc(13) | ambiente(1) |
 *  serie(6 = estab+ptoEmi) | secuencial(9) | códigoNumérico(8) | tipoEmisión(1) | dígitoVerificador(1)
 *
 * El dígito verificador es módulo 11 con factores 2..7 cíclicos de derecha a izquierda.
 */

export interface AccessKeyParts {
  /** Fecha de emisión. Se usan sus componentes locales (día/mes/año). */
  readonly fechaEmision: Date;
  readonly tipoComprobante: TipoComprobante;
  readonly ruc: string;
  readonly ambiente: Ambiente;
  readonly establecimiento: string;
  readonly puntoEmision: string;
  readonly secuencial: string;
  /** 8 dígitos. Si se omite, se genera aleatoriamente. */
  readonly codigoNumerico?: string;
  readonly tipoEmision?: TipoEmision;
}

export interface ParsedAccessKey {
  readonly clave: string;
  /** ddmmaaaa */
  readonly fecha: string;
  readonly tipoComprobante: TipoComprobante;
  readonly ruc: string;
  readonly ambiente: Ambiente;
  readonly establecimiento: string;
  readonly puntoEmision: string;
  readonly secuencial: string;
  readonly codigoNumerico: string;
  readonly tipoEmision: TipoEmision;
  readonly digitoVerificador: string;
}

const fail = (code: string, message: string) => err(new ValidationError(code, message));

export function computeCheckDigit(first48: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = first48.length - 1; i >= 0; i--) {
    sum += (first48.charCodeAt(i) - 48) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return String(dv === 11 ? 0 : dv === 10 ? 1 : dv);
}

function randomCodigoNumerico(): string {
  const n = new Uint32Array(1);
  globalThis.crypto.getRandomValues(n);
  return String((n[0] as number) % 100_000_000).padStart(8, '0');
}

function fixedDigits(name: string, value: string, len: number): ValidationError | null {
  return new RegExp(`^\\d{${len}}$`).test(value)
    ? null
    : new ValidationError('ACCESS_KEY_FIELD', `${name} debe tener exactamente ${len} dígitos numéricos`, {
        details: { field: name },
      });
}

export function generateAccessKey(p: AccessKeyParts): Result<string> {
  if (Number.isNaN(p.fechaEmision.getTime())) return fail('ACCESS_KEY_DATE', 'fecha de emisión inválida');
  const year = p.fechaEmision.getFullYear();
  if (year < 1000 || year > 9999) return fail('ACCESS_KEY_DATE', 'año de emisión fuera de rango');
  if (!isTipoComprobante(p.tipoComprobante)) return fail('ACCESS_KEY_DOC_TYPE', `tipo de comprobante desconocido: ${String(p.tipoComprobante)}`);
  if (!isAmbiente(p.ambiente)) return fail('ACCESS_KEY_ENV', `ambiente inválido: ${String(p.ambiente)}`);
  const tipoEmision = p.tipoEmision ?? TipoEmision.Normal;
  if (tipoEmision !== TipoEmision.Normal) return fail('ACCESS_KEY_EMISSION', `tipo de emisión no soportado: ${String(tipoEmision)}`);
  const codigo = p.codigoNumerico ?? randomCodigoNumerico();

  for (const [name, value, len] of [
    ['ruc', p.ruc, 13],
    ['establecimiento', p.establecimiento, 3],
    ['puntoEmision', p.puntoEmision, 3],
    ['secuencial', p.secuencial, 9],
    ['codigoNumerico', codigo, 8],
  ] as const) {
    const e = fixedDigits(name, value, len);
    if (e) return err(e);
  }

  const dd = String(p.fechaEmision.getDate()).padStart(2, '0');
  const mm = String(p.fechaEmision.getMonth() + 1).padStart(2, '0');
  const body =
    `${dd}${mm}${String(year)}${p.tipoComprobante}${p.ruc}${p.ambiente}` +
    `${p.establecimiento}${p.puntoEmision}${p.secuencial}${codigo}${tipoEmision}`;
  return ok(body + computeCheckDigit(body));
}

/** Descompone una clave y verifica longitud, estructura, campos conocidos, fecha real y dígito verificador. */
export function parseAccessKey(clave: string): Result<ParsedAccessKey> {
  if (!/^\d{49}$/.test(clave)) return fail('ACCESS_KEY_FORMAT', 'La clave de acceso debe tener exactamente 49 dígitos numéricos');
  const fecha = clave.slice(0, 8);
  const d = Number(fecha.slice(0, 2));
  const m = Number(fecha.slice(2, 4));
  const y = Number(fecha.slice(4, 8));
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return fail('ACCESS_KEY_DATE', `fecha inexistente en la clave: ${fecha}`);
  }
  const tipo = clave.slice(8, 10);
  if (!isTipoComprobante(tipo)) return fail('ACCESS_KEY_DOC_TYPE', `tipo de comprobante desconocido: ${tipo}`);
  const ambiente = clave.slice(23, 24);
  if (!isAmbiente(ambiente)) return fail('ACCESS_KEY_ENV', `ambiente inválido: ${ambiente}`);
  const tipoEmision = clave.slice(47, 48);
  if (tipoEmision !== TipoEmision.Normal) return fail('ACCESS_KEY_EMISSION', `tipo de emisión no soportado: ${tipoEmision}`);
  const dv = clave.slice(48);
  if (computeCheckDigit(clave.slice(0, 48)) !== dv) return fail('ACCESS_KEY_CHECK_DIGIT', 'Dígito verificador de la clave de acceso incorrecto');
  return ok({
    clave,
    fecha,
    tipoComprobante: tipo,
    ruc: clave.slice(10, 23),
    ambiente,
    establecimiento: clave.slice(24, 27),
    puntoEmision: clave.slice(27, 30),
    secuencial: clave.slice(30, 39),
    codigoNumerico: clave.slice(39, 47),
    tipoEmision,
    digitoVerificador: dv,
  });
}

export const isValidAccessKey = (clave: string): boolean => parseAccessKey(clave).ok;
