import { ConfigurationError, SriRejectionError, TransportError, ValidationError, Ambiente } from '@ecuador-tax/core';
import { parseAccessKey } from '@ecuador-tax/access-key';
import { buildAutorizacionRequest, buildRecepcionRequest, parseAutorizacionResponse, parseRecepcionResponse } from './soap.js';
import type { Autorizacion, FetchLike, RespuestaAutorizacion, RespuestaRecepcion } from './types.js';

const HOSTS = { '1': 'celcer.sri.gob.ec', '2': 'cel.sri.gob.ec' } as const;
const BASE_PATH = '/comprobantes-electronicos-ws';

export interface SriClientOptions {
  /** Obligatorio: sin valor por defecto para evitar emitir en producción por accidente. */
  readonly ambiente: Ambiente;
  /** Timeout por solicitud HTTP. Por defecto 30 s. */
  readonly timeoutMs?: number;
  /** Para pruebas o proxies. Debe ser `https:`. Reemplaza el host del ambiente. */
  readonly baseUrl?: string;
  /** Implementación de fetch; por defecto `globalThis.fetch`. */
  readonly fetch?: FetchLike;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

export interface PollOptions extends RequestOptions {
  /** Intervalo entre consultas de autorización. Por defecto 2000 ms. */
  readonly intervalMs?: number;
  /** Máximo de consultas. Por defecto 10. */
  readonly maxAttempts?: number;
  /** Códigos de mensaje de recepción que significan "ya recibido/en proceso": se continúa con la consulta. Por defecto 43 y 70. */
  readonly alreadyReceivedCodes?: readonly string[];
  /** Para pruebas. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export type EnvioResultado =
  | { readonly estado: 'AUTORIZADO'; readonly autorizacion: Autorizacion; readonly recepcion: RespuestaRecepcion | undefined }
  | { readonly estado: 'NO_AUTORIZADO'; readonly autorizacion: Autorizacion; readonly recepcion: RespuestaRecepcion | undefined }
  | { readonly estado: 'DEVUELTA'; readonly recepcion: RespuestaRecepcion }
  /** Recibida pero sin resolución de autorización dentro de los intentos: consulte de nuevo más tarde. */
  | { readonly estado: 'PENDIENTE'; readonly recepcion: RespuestaRecepcion | undefined; readonly ultimaConsulta: RespuestaAutorizacion };

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export class SriClient {
  readonly ambiente: Ambiente;
  readonly #timeoutMs: number;
  readonly #base: string;
  readonly #fetch: FetchLike;

  constructor(opts: SriClientOptions) {
    if (opts.ambiente !== Ambiente.Pruebas && opts.ambiente !== Ambiente.Produccion) {
      throw new ConfigurationError('SRI_AMBIENTE', 'ambiente debe ser "1" (pruebas) o "2" (producción)');
    }
    this.ambiente = opts.ambiente;
    this.#timeoutMs = opts.timeoutMs ?? 30_000;
    const base = opts.baseUrl ?? `https://${HOSTS[opts.ambiente]}${BASE_PATH}`;
    if (!base.startsWith('https://')) throw new ConfigurationError('SRI_INSECURE_URL', 'baseUrl debe usar https');
    this.#base = base.replace(/\/+$/, '');
    const f = opts.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (!f) throw new ConfigurationError('SRI_NO_FETCH', 'No hay implementación de fetch disponible (se requiere Node >= 20.3)');
    this.#fetch = f;
  }

  async #post(service: 'RecepcionComprobantesOffline' | 'AutorizacionComprobantesOffline', body: string, ambiguous: boolean, o: RequestOptions): Promise<string> {
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const signal = o.signal ? AbortSignal.any([timeout, o.signal]) : timeout;
    let status: number;
    let text: string;
    try {
      const res = await this.#fetch(`${this.#base}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body,
        signal,
        redirect: 'error',
      });
      status = res.status;
      text = await res.text();
    } catch (cause) {
      const timedOut = timeout.aborted;
      throw new TransportError(timedOut ? 'SRI_TIMEOUT' : o.signal?.aborted ? 'SRI_ABORTED' : 'SRI_NETWORK', timedOut ? `Tiempo de espera agotado (${this.#timeoutMs} ms)` : 'Fallo de red al contactar al SRI', { cause, ambiguous });
    }
    // Un SOAP Fault llega con HTTP 500 y cuerpo XML: se deja al parser clasificarlo.
    if (status >= 400 && !text.includes('Envelope')) {
      throw new TransportError('SRI_HTTP', `El SRI respondió HTTP ${status}`, { ambiguous });
    }
    return text;
  }

  /** Envía un comprobante firmado. Un fallo de transporte es AMBIGUO: consulte la autorización antes de reenviar. */
  async recepcion(xmlFirmado: string, o: RequestOptions = {}): Promise<RespuestaRecepcion> {
    const text = await this.#post('RecepcionComprobantesOffline', buildRecepcionRequest(xmlFirmado), true, o);
    return parseRecepcionResponse(text);
  }

  /** Consulta idempotente (segura de reintentar). */
  async autorizacion(claveAcceso: string, o: RequestOptions = {}): Promise<RespuestaAutorizacion> {
    const parsed = parseAccessKey(claveAcceso);
    if (!parsed.ok) throw parsed.error;
    if (parsed.value.ambiente !== this.ambiente) {
      throw new ValidationError('SRI_AMBIENTE_MISMATCH', 'La clave de acceso pertenece a otro ambiente que el cliente');
    }
    const text = await this.#post('AutorizacionComprobantesOffline', buildAutorizacionRequest(claveAcceso), false, o);
    return parseAutorizacionResponse(text);
  }

  /**
   * Flujo completo recepción → autorización, sin reintentos ciegos de envío:
   *  - DEVUELTA → se devuelve tal cual (el comprobante NO quedó registrado), salvo códigos "ya recibido".
   *  - Fallo ambiguo en recepción → se consulta la autorización; si el SRI ya lo conoce se continúa,
   *    si no, se relanza el error ambiguo (el llamador decide reenviar).
   */
  async enviarYAutorizar(xmlFirmado: string, claveAcceso: string, p: PollOptions = {}): Promise<EnvioResultado> {
    const parsedKey = parseAccessKey(claveAcceso);
    if (!parsedKey.ok) throw parsedKey.error;
    if (parsedKey.value.ambiente !== this.ambiente) {
      throw new ValidationError('SRI_AMBIENTE_MISMATCH', 'La clave de acceso pertenece a otro ambiente que el cliente');
    }
    const keyInXml = /<claveAcceso>(\d{49})<\/claveAcceso>/.exec(xmlFirmado)?.[1];
    if (keyInXml !== claveAcceso) {
      throw new ValidationError('SRI_KEY_MISMATCH', 'La clave de acceso no coincide con la del comprobante firmado');
    }
    const sleep = p.sleep ?? defaultSleep;
    const already = new Set(p.alreadyReceivedCodes ?? ['43', '70']);
    let recepcion: RespuestaRecepcion | undefined;

    try {
      recepcion = await this.recepcion(xmlFirmado, p);
    } catch (e) {
      if (!(e instanceof TransportError) || !e.ambiguous) throw e;
      const known = await this.autorizacion(claveAcceso, p).catch((x) => {
        if (x instanceof ValidationError) throw x;
        return undefined;
      });
      if (!known || known.autorizaciones.length === 0) throw e;
    }

    if (recepcion && recepcion.estado !== 'RECIBIDA') {
      const codes = recepcion.comprobantes.flatMap((c) => c.mensajes.map((m) => m.identificador ?? ''));
      const yaRecibido = codes.length > 0 && codes.every((c) => already.has(c));
      if (!yaRecibido) {
        if (recepcion.estado === 'DEVUELTA') return { estado: 'DEVUELTA', recepcion };
        throw new SriRejectionError('SRI_RECEPCION_ESTADO', `Estado de recepción desconocido: ${recepcion.estado}`);
      }
    }

    const max = p.maxAttempts ?? 10;
    const interval = p.intervalMs ?? 2000;
    let last: RespuestaAutorizacion = { claveAccesoConsultada: claveAcceso, numeroComprobantes: 0, autorizaciones: [] };
    for (let i = 0; i < max; i++) {
      if (i > 0) await sleep(interval, p.signal);
      try {
        last = await this.autorizacion(claveAcceso, p);
      } catch (e) {
        // El comprobante ya fue enviado: un fallo de consulta no debe parecer "no enviado".
        if (e instanceof TransportError) throw new TransportError(e.code, `${e.message} (el comprobante ya fue recibido por el SRI; consulte la autorización)`, { cause: e, ambiguous: true });
        throw e;
      }
      const ok = last.autorizaciones.find((x) => x.estado === 'AUTORIZADO');
      if (ok) return { estado: 'AUTORIZADO', autorizacion: ok, recepcion };
      const fin = last.autorizaciones.find((x) => x.estado !== 'EN PROCESO');
      if (fin) return { estado: 'NO_AUTORIZADO', autorizacion: fin, recepcion };
    }
    return { estado: 'PENDIENTE', recepcion, ultimaConsulta: last };
  }
}
