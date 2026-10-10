/**
 * Simulador de los servicios SOAP del SRI (formato tomado de los WSDL públicos de celcer.sri.gob.ec).
 * Devuelve una función compatible con `fetch` para inyectar en `SriClient`.
 */

export interface MockMensaje {
  identificador: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const env = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

const msgs = (ms: readonly MockMensaje[]) =>
  ms.length === 0
    ? ''
    : `<mensajes>${ms
        .map(
          (m) =>
            `<mensaje><identificador>${esc(m.identificador)}</identificador><mensaje>${esc(m.mensaje)}</mensaje>` +
            (m.informacionAdicional ? `<informacionAdicional>${esc(m.informacionAdicional)}</informacionAdicional>` : '') +
            `<tipo>${m.tipo ?? 'ERROR'}</tipo></mensaje>`,
        )
        .join('')}</mensajes>`;

export const mockRecepcionRecibida = (_claveAcceso?: string): string =>
  env(`<ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes/></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>`);

export const mockRecepcionDevuelta = (claveAcceso: string, mensajes: readonly MockMensaje[]): string =>
  env(
    `<ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>DEVUELTA</estado><comprobantes><comprobante><claveAcceso>${claveAcceso}</claveAcceso>${msgs(mensajes)}</comprobante></comprobantes></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>`,
  );

export interface MockAutorizacion {
  estado: 'AUTORIZADO' | 'NO AUTORIZADO' | 'EN PROCESO';
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  ambiente?: string;
  comprobante?: string;
  mensajes?: readonly MockMensaje[];
}

export const mockAutorizacion = (claveAcceso: string, autorizaciones: readonly MockAutorizacion[]): string =>
  env(
    `<ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><RespuestaAutorizacionComprobante><claveAccesoConsultada>${claveAcceso}</claveAccesoConsultada><numeroComprobantes>${autorizaciones.length}</numeroComprobantes><autorizaciones>${autorizaciones
      .map(
        (a) =>
          `<autorizacion><estado>${a.estado}</estado>` +
          (a.numeroAutorizacion ? `<numeroAutorizacion>${a.numeroAutorizacion}</numeroAutorizacion>` : '') +
          (a.fechaAutorizacion ? `<fechaAutorizacion>${a.fechaAutorizacion}</fechaAutorizacion>` : '') +
          (a.ambiente ? `<ambiente>${a.ambiente}</ambiente>` : '') +
          (a.comprobante ? `<comprobante>${esc(a.comprobante)}</comprobante>` : '') +
          msgs(a.mensajes ?? []) +
          `</autorizacion>`,
      )
      .join('')}</autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse>`,
  );

export const mockSoapFault = (message: string): string =>
  env(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${esc(message)}</faultstring></soap:Fault>`);

export type MockStep =
  | { kind: 'xml'; body: string; status?: number }
  | { kind: 'network-error' }
  | { kind: 'hang' };

export interface MockCall {
  url: string;
  service: 'RecepcionComprobantesOffline' | 'AutorizacionComprobantesOffline';
  body: string;
}

/**
 * Crea un `fetch` simulado que responde, por servicio, con una secuencia de pasos
 * (el último paso se repite). Registra las llamadas en `calls`.
 */
export function createMockSriFetch(script: Partial<Record<MockCall['service'], readonly MockStep[]>>) {
  const calls: MockCall[] = [];
  const counters = new Map<string, number>();
  const fetchFn = async (
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'error' },
  ): Promise<{ status: number; text(): Promise<string> }> => {
    const service = url.endsWith('/RecepcionComprobantesOffline') ? 'RecepcionComprobantesOffline' : 'AutorizacionComprobantesOffline';
    calls.push({ url, service, body: init.body });
    const steps = script[service] ?? [];
    const i = counters.get(service) ?? 0;
    counters.set(service, i + 1);
    const step = steps[Math.min(i, steps.length - 1)];
    if (!step) throw new Error(`sin guion para ${service}`);
    if (step.kind === 'network-error') throw new TypeError('fetch failed');
    if (step.kind === 'hang') {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    }
    return { status: step.status ?? 200, text: async () => step.body };
  };
  return { fetch: fetchFn, calls };
}
