import { ValidationError, err, ok, type Result } from '@ecuador-tax/core';

/**
 * Validación de FORMATO y dígito verificador. No comprueba existencia,
 * vigencia ni estado ante el Registro Civil o el SRI.
 */

export type RucTipo = 'persona-natural' | 'sociedad-privada' | 'sociedad-publica';

export interface CedulaInfo {
  readonly tipo: 'cedula';
  readonly valor: string;
  readonly provincia: string;
}

export interface RucInfo {
  readonly tipo: 'ruc';
  readonly valor: string;
  readonly provincia: string;
  readonly rucTipo: RucTipo;
  readonly establecimiento: string;
}

export type IdentificationInfo = CedulaInfo | RucInfo;

const fail = (code: string, message: string, details?: Record<string, unknown>) =>
  err(new ValidationError(code, message, details ? { details } : {}));

/** Provincias 01-24; 30 = ecuatorianos registrados en el exterior. */
function provinciaValida(code: number): boolean {
  return (code >= 1 && code <= 24) || code === 30;
}

function digitsOf(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) - 48);
}

function mod10Check(first9: number[]): number {
  let sum = 0;
  first9.forEach((d, i) => {
    let p = i % 2 === 0 ? d * 2 : d;
    if (p > 9) p -= 9;
    sum += p;
  });
  return (10 - (sum % 10)) % 10;
}

/** Retorna el dígito verificador módulo 11, o `null` si resultaría 10 (inválido para RUC jurídico). */
function mod11Check(digits: number[], coefs: readonly number[]): number | null {
  let sum = 0;
  coefs.forEach((c, i) => {
    sum += c * (digits[i] as number);
  });
  const r = sum % 11;
  const dv = r === 0 ? 0 : 11 - r;
  return dv === 10 ? null : dv;
}

export function validateCedula(input: string): Result<CedulaInfo> {
  if (!/^\d{10}$/.test(input)) {
    return fail('CEDULA_FORMAT', 'La cédula debe tener exactamente 10 dígitos numéricos');
  }
  const d = digitsOf(input);
  const prov = Number(input.slice(0, 2));
  if (!provinciaValida(prov)) {
    return fail('CEDULA_PROVINCE', `Código de provincia inválido: ${input.slice(0, 2)}`);
  }
  if ((d[2] as number) > 5) {
    return fail('CEDULA_THIRD_DIGIT', 'El tercer dígito de una cédula debe estar entre 0 y 5');
  }
  if (mod10Check(d.slice(0, 9)) !== d[9]) {
    return fail('CEDULA_CHECK_DIGIT', 'Dígito verificador de cédula incorrecto');
  }
  return ok({ tipo: 'cedula', valor: input, provincia: input.slice(0, 2) });
}

const COEF_PRIVADA = [4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const COEF_PUBLICA = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export function validateRuc(input: string): Result<RucInfo> {
  if (!/^\d{13}$/.test(input)) {
    return fail('RUC_FORMAT', 'El RUC debe tener exactamente 13 dígitos numéricos');
  }
  const d = digitsOf(input);
  const prov = Number(input.slice(0, 2));
  if (!provinciaValida(prov)) {
    return fail('RUC_PROVINCE', `Código de provincia inválido: ${input.slice(0, 2)}`);
  }
  const third = d[2] as number;
  const provincia = input.slice(0, 2);

  const natural = (): Result<RucInfo> | null => {
    if (!validateCedula(input.slice(0, 10)).ok) return null;
    const est = input.slice(10);
    if (est === '000') return fail('RUC_ESTABLISHMENT', 'Código de establecimiento inválido (000)');
    return ok({ tipo: 'ruc', valor: input, provincia, rucTipo: 'persona-natural', establecimiento: est });
  };
  const privada = (): Result<RucInfo> | null => {
    const dv = mod11Check(d, COEF_PRIVADA);
    if (dv === null || dv !== d[9]) return null;
    const est = input.slice(10);
    if (est === '000') return fail('RUC_ESTABLISHMENT', 'Código de establecimiento inválido (000)');
    return ok({ tipo: 'ruc', valor: input, provincia, rucTipo: 'sociedad-privada', establecimiento: est });
  };
  const publica = (): Result<RucInfo> | null => {
    const dv = mod11Check(d, COEF_PUBLICA);
    if (dv === null || dv !== d[8]) return null;
    const est = input.slice(9);
    if (est === '0000') return fail('RUC_ESTABLISHMENT', 'Código de establecimiento inválido (0000)');
    return ok({ tipo: 'ruc', valor: input, provincia, rucTipo: 'sociedad-publica', establecimiento: est });
  };

  // Un algoritmo por tercer dígito. No se aceptan "formatos cruzados": multiplicarían ~10 % los falsos positivos
  // sin una fuente oficial que los respalde.
  let attempts: Array<() => Result<RucInfo> | null>;
  let failCode: string;
  if (third <= 5) {
    attempts = [natural];
    failCode = 'Dígito verificador de RUC de persona natural incorrecto';
  } else if (third === 9) {
    attempts = [privada];
    failCode = 'Dígito verificador de RUC de sociedad privada incorrecto';
  } else if (third === 6) {
    attempts = [publica];
    failCode = 'Dígito verificador de RUC de sociedad pública incorrecto';
  } else {
    return fail('RUC_THIRD_DIGIT', 'El tercer dígito del RUC debe ser 0-6 o 9');
  }
  let establishmentError: Result<RucInfo> | undefined;
  for (const attempt of attempts) {
    const r = attempt();
    if (r?.ok) return r;
    if (r) establishmentError = r;
  }
  return establishmentError ?? fail('RUC_CHECK_DIGIT', failCode);
}

/** Valida una cédula (10 dígitos) o un RUC (13 dígitos) según la longitud. */
export function validateIdentification(input: string): Result<IdentificationInfo> {
  if (/^\d{10}$/.test(input)) return validateCedula(input);
  if (/^\d{13}$/.test(input)) return validateRuc(input);
  return fail('IDENTIFICATION_FORMAT', 'La identificación debe ser una cédula (10 dígitos) o un RUC (13 dígitos)');
}

export const isValidCedula = (s: string): boolean => validateCedula(s).ok;
export const isValidRuc = (s: string): boolean => validateRuc(s).ok;

/**
 * Verificación de existencia/vigencia (opcional, la hace un tercero).
 *
 * El SDK solo valida formato y dígito verificador. No existe una API pública y documentada del Registro Civil
 * ni del SRI para verificar la existencia de una cédula o RUC (el SRI lo hace por su cuenta al recibir el comprobante:
 * errores 46, 59 y 69 de la ficha técnica). Si necesita verificar antes de emitir, implemente este contrato
 * con el proveedor autorizado que use (convenio de interoperabilidad, proveedor de verificación, base propia).
 */
export type IdentificationStatus = 'exists' | 'not-found' | 'unknown';

export interface IdentityVerifier {
  verify(identification: IdentificationInfo, options?: { signal?: AbortSignal }): Promise<IdentificationStatus>;
}

export interface VerifiedIdentification {
  readonly info: IdentificationInfo;
  readonly status: IdentificationStatus;
}

/** Valida el formato y, solo si es correcto, consulta al verificador. Los fallos del verificador resultan en `unknown`. */
export async function validateAndVerify(
  input: string,
  verifier: IdentityVerifier,
  options: { signal?: AbortSignal } = {},
): Promise<Result<VerifiedIdentification>> {
  const r = validateIdentification(input);
  if (!r.ok) return r;
  let status: IdentificationStatus;
  try {
    status = await verifier.verify(r.value, options);
  } catch (e) {
    if (options.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw e;
    status = 'unknown';
  }
  return ok({ info: r.value, status });
}
