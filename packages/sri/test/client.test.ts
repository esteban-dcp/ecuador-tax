import { describe, expect, it } from 'vitest';
import { Ambiente, ConfigurationError, SriRejectionError, TransportError, ValidationError } from '@ecuador-tax/core';
import { generateAccessKey } from '@ecuador-tax/access-key';
import { TipoComprobante } from '@ecuador-tax/core';
import { createMockSriFetch, mockAutorizacion, mockRecepcionDevuelta, mockRecepcionRecibida, mockSoapFault } from '@ecuador-tax/testing';
import { SriClient, buildRecepcionRequest } from '@ecuador-tax/sri';

const key = (() => {
  const k = generateAccessKey({
    fechaEmision: new Date(2026, 9, 10),
    tipoComprobante: TipoComprobante.Factura,
    ruc: '1790016919001',
    ambiente: Ambiente.Pruebas,
    establecimiento: '001',
    puntoEmision: '001',
    secuencial: '000000001',
    codigoNumerico: '12345678',
  });
  if (!k.ok) throw k.error;
  return k.value;
})();
const XML = `<factura id="comprobante"><claveAcceso>${key}</claveAcceso></factura>`;
const noSleep = async () => {};
const AUTH_OK = { estado: 'AUTORIZADO', numeroAutorizacion: key, fechaAutorizacion: '2026-10-10T10:00:00-05:00', ambiente: 'PRUEBAS', comprobante: '<x/>' } as const;

const client = (script: Parameters<typeof createMockSriFetch>[0], extra = {}) => {
  const m = createMockSriFetch(script);
  return { m, c: new SriClient({ ambiente: Ambiente.Pruebas, fetch: m.fetch, ...extra }) };
};

describe('configuración', () => {
  it('exige ambiente válido y https', () => {
    expect(() => new SriClient({ ambiente: '3' as never })).toThrow(ConfigurationError);
    expect(() => new SriClient({ ambiente: Ambiente.Pruebas, baseUrl: 'http://x' })).toThrow(/https/);
  });
  it('usa el host correcto por ambiente', async () => {
    const m = createMockSriFetch({ AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, []) }] });
    await new SriClient({ ambiente: Ambiente.Pruebas, fetch: m.fetch }).autorizacion(key);
    expect(m.calls[0]?.url).toBe('https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline');
  });
  it('rechaza clave de otro ambiente', async () => {
    const { c } = client({});
    const prod = new SriClient({ ambiente: Ambiente.Produccion, fetch: createMockSriFetch({}).fetch });
    await expect(prod.autorizacion(key)).rejects.toBeInstanceOf(ValidationError);
    expect(c).toBeTruthy();
  });
});

describe('recepcion', () => {
  it('codifica el XML en base64 dentro del sobre SOAP', () => {
    const req = buildRecepcionRequest('<a>é</a>');
    expect(req).toContain(Buffer.from('<a>é</a>', 'utf8').toString('base64'));
    expect(req).toContain('http://ec.gob.sri.ws.recepcion');
  });
  it('parsea DEVUELTA con mensajes', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionDevuelta(key, [{ identificador: '35', mensaje: 'DOCUMENTO INVALIDO', informacionAdicional: 'x', tipo: 'ERROR' }]) }] });
    const r = await c.recepcion(XML);
    expect(r.estado).toBe('DEVUELTA');
    expect(r.comprobantes[0]?.mensajes[0]).toMatchObject({ identificador: '35', mensaje: 'DOCUMENTO INVALIDO' });
  });
  it('clasifica SOAP Fault como transporte ambiguo', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', status: 500, body: mockSoapFault('boom') }] });
    const e = await c.recepcion(XML).catch((x) => x);
    expect(e).toBeInstanceOf(TransportError);
    expect(e).toMatchObject({ code: 'SRI_SOAP_FAULT', ambiguous: true });
  });
  it('HTTP 502 sin sobre y cuerpo no XML', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', status: 502, body: '<html>bad gateway</html>' }] });
    await expect(c.recepcion(XML)).rejects.toMatchObject({ code: 'SRI_HTTP', ambiguous: true });
  });
  it('timeout es ambiguo en recepción pero no en autorización', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'hang' }], AutorizacionComprobantesOffline: [{ kind: 'hang' }] }, { timeoutMs: 20 });
    await expect(c.recepcion(XML)).rejects.toMatchObject({ code: 'SRI_TIMEOUT', ambiguous: true });
    await expect(c.autorizacion(key)).rejects.toMatchObject({ code: 'SRI_TIMEOUT', ambiguous: false });
  });
  it('respuesta ilegible', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', body: '<soap:Envelope xmlns:soap="x"><oops' }] });
    await expect(c.recepcion(XML)).rejects.toMatchObject({ code: 'SRI_BAD_RESPONSE' });
  });
});

describe('enviarYAutorizar', () => {
  it('camino feliz con espera por EN PROCESO', async () => {
    const { m, c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }],
      AutorizacionComprobantesOffline: [
        { kind: 'xml', body: mockAutorizacion(key, []) },
        { kind: 'xml', body: mockAutorizacion(key, [{ estado: 'EN PROCESO' }]) },
        { kind: 'xml', body: mockAutorizacion(key, [AUTH_OK]) },
      ],
    });
    const r = await c.enviarYAutorizar(XML, key, { sleep: noSleep });
    expect(r.estado).toBe('AUTORIZADO');
    expect(m.calls.filter((x) => x.service === 'RecepcionComprobantesOffline')).toHaveLength(1);
    expect(m.calls.filter((x) => x.service === 'AutorizacionComprobantesOffline')).toHaveLength(3);
  });
  it('DEVUELTA no consulta autorización ni reintenta', async () => {
    const { m, c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionDevuelta(key, [{ identificador: '35', mensaje: 'X' }]) }] });
    const r = await c.enviarYAutorizar(XML, key, { sleep: noSleep });
    expect(r.estado).toBe('DEVUELTA');
    expect(m.calls).toHaveLength(1);
  });
  it('NO AUTORIZADO se reporta con mensajes', async () => {
    const { c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, [{ estado: 'NO AUTORIZADO', mensajes: [{ identificador: '39', mensaje: 'FIRMA INVALIDA' }] }]) }],
    });
    const r = await c.enviarYAutorizar(XML, key, { sleep: noSleep });
    expect(r.estado).toBe('NO_AUTORIZADO');
    expect(r.estado === 'NO_AUTORIZADO' && r.autorizacion.mensajes[0]?.identificador).toBe('39');
  });
  it('código 43 (ya registrada) continúa con la consulta en vez de fallar', async () => {
    const { c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionDevuelta(key, [{ identificador: '43', mensaje: 'CLAVE ACCESO REGISTRADA' }]) }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, [AUTH_OK]) }],
    });
    expect((await c.enviarYAutorizar(XML, key, { sleep: noSleep })).estado).toBe('AUTORIZADO');
  });
  it('timeout ambiguo: si el SRI ya lo conoce, recupera sin reenviar', async () => {
    const { m, c } = client({
      RecepcionComprobantesOffline: [{ kind: 'network-error' }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, [AUTH_OK]) }],
    });
    const r = await c.enviarYAutorizar(XML, key, { sleep: noSleep });
    expect(r.estado).toBe('AUTORIZADO');
    expect(m.calls.filter((x) => x.service === 'RecepcionComprobantesOffline')).toHaveLength(1);
  });
  it('fallo ambiguo y SRI sin registro: relanza el error sin reenviar', async () => {
    const { m, c } = client({
      RecepcionComprobantesOffline: [{ kind: 'network-error' }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, []) }],
    });
    await expect(c.enviarYAutorizar(XML, key, { sleep: noSleep })).rejects.toMatchObject({ ambiguous: true });
    expect(m.calls.filter((x) => x.service === 'RecepcionComprobantesOffline')).toHaveLength(1);
  });
  it('PENDIENTE al agotar intentos', async () => {
    const { c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, []) }],
    });
    const r = await c.enviarYAutorizar(XML, key, { sleep: noSleep, maxAttempts: 3 });
    expect(r.estado).toBe('PENDIENTE');
  });
  it('estado de recepción desconocido -> SriRejectionError', async () => {
    const { c } = client({ RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida().replace('RECIBIDA', 'RARA') }] });
    await expect(c.enviarYAutorizar(XML, key, { sleep: noSleep })).rejects.toBeInstanceOf(SriRejectionError);
  });
});

describe('pre-validación y robustez', () => {
  it('no envía si la clave no coincide con el XML o es de otro ambiente', async () => {
    const m = createMockSriFetch({ RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }] });
    const c = new SriClient({ ambiente: Ambiente.Pruebas, fetch: m.fetch });
    await expect(c.enviarYAutorizar('<factura/>', key, { sleep: noSleep })).rejects.toMatchObject({ code: 'SRI_KEY_MISMATCH' });
    await expect(c.enviarYAutorizar(`<claveAcceso>${key}</claveAcceso>`, key.slice(0, 48) + '0', { sleep: noSleep })).rejects.toBeInstanceOf(ValidationError);
    expect(m.calls).toHaveLength(0);
  });
  const XMLK = XML;
  it('error de red durante el polling queda marcado como ambiguo', async () => {
    const { c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }],
      AutorizacionComprobantesOffline: [{ kind: 'network-error' }],
    });
    await expect(c.enviarYAutorizar(XMLK, key, { sleep: noSleep })).rejects.toMatchObject({ ambiguous: true });
  });
  it('prefiere AUTORIZADO si hay varias entradas', async () => {
    const { c } = client({
      RecepcionComprobantesOffline: [{ kind: 'xml', body: mockRecepcionRecibida() }],
      AutorizacionComprobantesOffline: [{ kind: 'xml', body: mockAutorizacion(key, [{ estado: 'NO AUTORIZADO' }, AUTH_OK]) }],
    });
    expect((await c.enviarYAutorizar(XMLK, key, { sleep: noSleep })).estado).toBe('AUTORIZADO');
  });
});
