export interface SriMensaje {
  readonly identificador: string | undefined;
  readonly mensaje: string | undefined;
  readonly informacionAdicional: string | undefined;
  /** Normalmente `ERROR`, `ADVERTENCIA` o `INFORMATIVO`. */
  readonly tipo: string | undefined;
}

export type EstadoRecepcion = 'RECIBIDA' | 'DEVUELTA' | (string & {});

export interface RecepcionComprobante {
  readonly claveAcceso: string | undefined;
  readonly mensajes: readonly SriMensaje[];
}

export interface RespuestaRecepcion {
  readonly estado: EstadoRecepcion;
  readonly comprobantes: readonly RecepcionComprobante[];
}

export type EstadoAutorizacion = 'AUTORIZADO' | 'NO AUTORIZADO' | 'EN PROCESO' | (string & {});

export interface Autorizacion {
  readonly estado: EstadoAutorizacion;
  readonly numeroAutorizacion: string | undefined;
  readonly fechaAutorizacion: string | undefined;
  readonly ambiente: string | undefined;
  /** XML del comprobante tal como lo devuelve el SRI (puede contener datos sensibles: no lo registre). */
  readonly comprobante: string | undefined;
  readonly mensajes: readonly SriMensaje[];
}

export interface RespuestaAutorizacion {
  readonly claveAccesoConsultada: string | undefined;
  readonly numeroComprobantes: number;
  readonly autorizaciones: readonly Autorizacion[];
}

export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'error' }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;
