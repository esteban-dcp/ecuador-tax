import { ValidationError } from './errors.js';

/**
 * Formatea un importe con exactamente `decimals` decimales usando aritmética
 * decimal sobre la representación textual (sin errores de coma flotante).
 * Redondeo "half up" (away from zero) sobre el valor decimal exacto de entrada.
 *
 * Acepta `number` solo si es finito; para máxima fidelidad prefiera `string`.
 */
export function formatDecimal(value: number | string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new ValidationError('DECIMALS_RANGE', `decimales fuera de rango: ${decimals}`);
  }
  const text = typeof value === 'number' ? numberToPlain(value) : value.trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new ValidationError('DECIMAL_FORMAT', `importe no válido: "${String(value)}"`);
  const sign = m[1] === '-' ? '-' : '';
  const intPart = m[2] as string;
  const frac = m[3] ?? '';
  const padded = frac.padEnd(decimals, '0');
  let digits = BigInt(intPart + padded.slice(0, decimals));
  if (padded.length > decimals && (padded.charCodeAt(decimals) ?? 48) >= 53) digits += 1n;
  let s = digits.toString().padStart(decimals + 1, '0');
  const body = decimals === 0 ? s : `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
  s = body;
  return /^0(\.0*)?$/.test(s) ? s : sign + s;
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new ValidationError('DECIMAL_FORMAT', 'importe no finito');
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

/** Fecha en formato `dd/mm/aaaa` usado por los XML del SRI. Usa componentes locales de la fecha dada. */
export function formatFechaSri(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new ValidationError('DATE_INVALID', 'fecha inválida');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${String(d.getFullYear()).padStart(4, '0')}`;
}

/** Valida y normaliza una fecha `dd/mm/aaaa` (existencia real del día). */
export function parseFechaSri(text: string): Date {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) throw new ValidationError('DATE_FORMAT', `fecha debe ser dd/mm/aaaa: "${text}"`);
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new ValidationError('DATE_INVALID', `fecha inexistente: "${text}"`);
  }
  return date;
}
