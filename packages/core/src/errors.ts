/** Categorías de error del SDK. Permiten distinguir la causa sin inspeccionar mensajes. */
export type ErrorKind =
  | 'validation'
  | 'configuration'
  | 'crypto'
  | 'sri-rejection'
  | 'transport';

export interface ErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class EcuadorTaxError extends Error {
  readonly kind: ErrorKind;
  /** Código estable legible por máquina, p. ej. `CEDULA_CHECK_DIGIT`. */
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(kind: ErrorKind, code: string, message: string, options: ErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.code = code;
    this.details = options.details;
  }
}

/** Datos de entrada que no cumplen una regla de formato o negocio. */
export class ValidationError extends EcuadorTaxError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super('validation', code, message, options);
  }
}

/** Configuración ausente o inconsistente (ambiente, URLs, opciones). */
export class ConfigurationError extends EcuadorTaxError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super('configuration', code, message, options);
  }
}

/**
 * Fallo criptográfico (certificado inválido, contraseña incorrecta, firma).
 * Los mensajes NUNCA incluyen material de claves ni contraseñas.
 */
export class CryptoError extends EcuadorTaxError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super('crypto', code, message, options);
  }
}

/** El SRI respondió y rechazó/devolvió el comprobante (no es un fallo de red). */
export class SriRejectionError extends EcuadorTaxError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super('sri-rejection', code, message, options);
  }
}

/**
 * Fallo de red, timeout o respuesta ilegible. `ambiguous` indica que no se
 * puede saber si el SRI llegó a procesar la solicitud: consulte la
 * autorización por clave de acceso antes de reenviar.
 */
export class TransportError extends EcuadorTaxError {
  readonly ambiguous: boolean;
  constructor(code: string, message: string, options: ErrorOptions & { ambiguous?: boolean } = {}) {
    super('transport', code, message, options);
    this.ambiguous = options.ambiguous ?? false;
  }
}
