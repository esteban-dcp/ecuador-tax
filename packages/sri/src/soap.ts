import { DOMParser } from '@xmldom/xmldom';
import { TransportError } from '@ecuador-tax/core';
import type { Autorizacion, RespuestaAutorizacion, RespuestaRecepcion, SriMensaje } from './types.js';

export const NS_RECEPCION = 'http://ec.gob.sri.ws.recepcion';
export const NS_AUTORIZACION = 'http://ec.gob.sri.ws.autorizacion';

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const envelope = (inner: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body>' +
  inner +
  '</soapenv:Body></soapenv:Envelope>';

export const buildRecepcionRequest = (xml: string): string =>
  envelope(`<ec:validarComprobante xmlns:ec="${NS_RECEPCION}"><xml>${Buffer.from(xml, 'utf8').toString('base64')}</xml></ec:validarComprobante>`);

export const buildAutorizacionRequest = (claveAcceso: string): string =>
  envelope(`<ec:autorizacionComprobante xmlns:ec="${NS_AUTORIZACION}"><claveAccesoComprobante>${xmlEscape(claveAcceso)}</claveAccesoComprobante></ec:autorizacionComprobante>`);

function parse(text: string): Element {
  try {
    const errors: string[] = [];
    const doc = new DOMParser({ onError: (l, m) => l !== 'warning' && errors.push(m) }).parseFromString(text, 'text/xml');
    if (errors.length || !doc.documentElement) throw new Error('mal formado');
    return doc.documentElement as unknown as Element;
  } catch {
    throw new TransportError('SRI_BAD_RESPONSE', 'La respuesta del SRI no es XML válido', { ambiguous: true });
  }
}

const kids = (e: Element, name: string): Element[] =>
  Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name);
const first = (e: Element | undefined, name: string): Element | undefined => (e ? kids(e, name)[0] : undefined);
const text = (e: Element | undefined, name: string): string | undefined => {
  const c = first(e, name);
  return c ? (c.textContent ?? '') : undefined;
};
function descend(e: Element, ...names: string[]): Element | undefined {
  let cur: Element | undefined = e;
  for (const n of names) cur = first(cur, n);
  return cur;
}

function body(root: Element): Element {
  const b = first(root, 'Body');
  if (!b) throw new TransportError('SRI_BAD_RESPONSE', 'Respuesta SOAP sin Body', { ambiguous: true });
  const fault = first(b, 'Fault');
  if (fault) {
    throw new TransportError('SRI_SOAP_FAULT', `SOAP Fault: ${text(fault, 'faultstring') ?? 'sin detalle'}`, { ambiguous: true });
  }
  return b;
}

function mensajes(parent: Element | undefined): SriMensaje[] {
  const m = parent ? first(parent, 'mensajes') : undefined;
  return m
    ? kids(m, 'mensaje').map((x) => ({
        identificador: text(x, 'identificador'),
        mensaje: text(x, 'mensaje'),
        informacionAdicional: text(x, 'informacionAdicional'),
        tipo: text(x, 'tipo'),
      }))
    : [];
}

export function parseRecepcionResponse(xml: string): RespuestaRecepcion {
  const resp = descend(body(parse(xml)), 'validarComprobanteResponse', 'RespuestaRecepcionComprobante');
  const estado = text(resp, 'estado');
  if (!resp || !estado) throw new TransportError('SRI_BAD_RESPONSE', 'Respuesta de recepción sin estado', { ambiguous: true });
  const lista = first(resp, 'comprobantes');
  return {
    estado,
    comprobantes: lista ? kids(lista, 'comprobante').map((c) => ({ claveAcceso: text(c, 'claveAcceso'), mensajes: mensajes(c) })) : [],
  };
}

export function parseAutorizacionResponse(xml: string): RespuestaAutorizacion {
  const resp = descend(body(parse(xml)), 'autorizacionComprobanteResponse', 'RespuestaAutorizacionComprobante');
  if (!resp) throw new TransportError('SRI_BAD_RESPONSE', 'Respuesta de autorización inesperada', { ambiguous: false });
  const lista = first(resp, 'autorizaciones');
  const autorizaciones: Autorizacion[] = lista
    ? kids(lista, 'autorizacion').map((a) => ({
        estado: text(a, 'estado') ?? '',
        numeroAutorizacion: text(a, 'numeroAutorizacion'),
        fechaAutorizacion: text(a, 'fechaAutorizacion'),
        ambiente: text(a, 'ambiente'),
        comprobante: text(a, 'comprobante'),
        mensajes: mensajes(a),
      }))
    : [];
  return {
    claveAccesoConsultada: text(resp, 'claveAccesoConsultada'),
    numeroComprobantes: Number(text(resp, 'numeroComprobantes') ?? autorizaciones.length) || 0,
    autorizaciones,
  };
}
