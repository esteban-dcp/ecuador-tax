import { TipoComprobante, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import { maquinaFiscalXml, type MaquinaFiscal } from './extras.js';
import {
  MAX,
  bad,
  detallesAdicionalesXml,
  document,
  fecha,
  infoAdicionalXml,
  infoTributaria,
  nonNegative,
  obligado,
  quantity,
  requireText,
  validateEmisor,
  type DetalleAdicional,
  type DocumentXml,
  type Emisor,
  type TipoIdentificacion,
} from './common.js';

export const GUIA_REMISION_VERSION = '1.1.0';

export interface DetalleGuia {
  readonly codigoInterno?: string;
  readonly codigoAdicional?: string;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly detallesAdicionales?: readonly DetalleAdicional[];
}

export interface Destinatario {
  readonly identificacion: string;
  readonly razonSocial: string;
  readonly direccion: string;
  readonly motivoTraslado: string;
  readonly docAduaneroUnico?: string;
  /** 3 dígitos. */
  readonly codEstabDestino?: string;
  readonly ruta?: string;
  readonly docSustento?: {
    readonly codDoc: string;
    /** `001-001-000000001`. */
    readonly numero: string;
    readonly numAutorizacion?: string;
    readonly fechaEmision?: Date;
  };
  readonly detalles: readonly DetalleGuia[];
}

export interface GuiaRemisionInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string;
  readonly emisor: Emisor;
  readonly direccionPartida: string;
  readonly transportista: { readonly tipoIdentificacion: TipoIdentificacion; readonly identificacion: string; readonly razonSocial: string };
  readonly fechaIniTransporte: Date;
  readonly fechaFinTransporte: Date;
  readonly placa: string;
  readonly destinatarios: readonly Destinatario[];
  readonly infoAdicional?: Readonly<Record<string, string>>;
  readonly rise?: string;
  readonly maquinaFiscal?: MaquinaFiscal;
}

export function buildGuiaRemisionXml(input: GuiaRemisionInput): DocumentXml {
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  requireText('direccionPartida', input.direccionPartida, MAX.texto);
  requireText('transportista.razonSocial', input.transportista.razonSocial, MAX.texto);
  requireText('transportista.identificacion', input.transportista.identificacion, 20);
  requireText('placa', input.placa, 20);
  if (input.rise !== undefined) requireText('rise', input.rise, 40);
  if (input.transportista.tipoIdentificacion === '07') throw bad('GUIA_TRANSPORTISTA_ID', 'el transportista no puede ser consumidor final');
  const day = (d: Date) => d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
  if (day(input.fechaFinTransporte) < day(input.fechaIniTransporte)) throw bad('GUIA_FECHAS', 'fechaFinTransporte no puede ser anterior a fechaIniTransporte');
  if (day(input.fechaIniTransporte) < day(input.fechaEmision)) throw bad('GUIA_FECHA_INICIO', 'fechaIniTransporte no puede ser anterior a la fecha de emisión (SRI error 82)');
  if (input.destinatarios.length === 0) throw bad('GUIA_NO_DEST', 'se requiere al menos un destinatario');
  for (const [i, d] of input.destinatarios.entries()) {
    const at = `destinatarios[${i}]`;
    requireText(`${at}.razonSocial`, d.razonSocial, MAX.texto);
    requireText(`${at}.identificacion`, d.identificacion, 20);
    requireText(`${at}.direccion`, d.direccion, MAX.texto);
    requireText(`${at}.motivoTraslado`, d.motivoTraslado, MAX.texto);
    if (d.codEstabDestino !== undefined && !/^\d{3}$/.test(d.codEstabDestino)) throw bad('GUIA_ESTAB', `${at}.codEstabDestino debe tener 3 dígitos`);
    if (d.docSustento && !/^\d{3}-\d{3}-\d{9}$/.test(d.docSustento.numero)) throw bad('GUIA_DOC_NUM', `${at}.docSustento.numero debe tener formato 001-001-000000001`);
    if (d.detalles.length === 0) throw bad('GUIA_NO_LINES', `${at} requiere al menos un detalle`);
    for (const l of d.detalles) {
      requireText(`${at}.detalle.descripcion`, l.descripcion, MAX.texto);
      nonNegative(`${at}.detalle.cantidad`, l.cantidad);
    }
  }
  const e = input.emisor;
  const tributaria = infoTributaria(TipoComprobante.GuiaRemision, e, input);
  const info = el('infoGuiaRemision', [
    opt('dirEstablecimiento', e.direccionEstablecimiento),
    el('dirPartida', input.direccionPartida),
    el('razonSocialTransportista', input.transportista.razonSocial),
    el('tipoIdentificacionTransportista', input.transportista.tipoIdentificacion),
    el('rucTransportista', input.transportista.identificacion),
    opt('rise', input.rise),
    obligado(e),
    opt('contribuyenteEspecial', e.contribuyenteEspecial),
    el('fechaIniTransporte', fecha(input.fechaIniTransporte)),
    el('fechaFinTransporte', fecha(input.fechaFinTransporte)),
    el('placa', input.placa),
  ]);
  const dest = el(
    'destinatarios',
    input.destinatarios.map((d) =>
      el('destinatario', [
        el('identificacionDestinatario', d.identificacion),
        el('razonSocialDestinatario', d.razonSocial),
        el('dirDestinatario', d.direccion),
        el('motivoTraslado', d.motivoTraslado),
        opt('docAduaneroUnico', d.docAduaneroUnico),
        opt('codEstabDestino', d.codEstabDestino),
        opt('ruta', d.ruta),
        opt('codDocSustento', d.docSustento?.codDoc),
        opt('numDocSustento', d.docSustento?.numero),
        opt('numAutDocSustento', d.docSustento?.numAutorizacion),
        d.docSustento?.fechaEmision ? el('fechaEmisionDocSustento', fecha(d.docSustento.fechaEmision)) : undefined,
        el(
          'detalles',
          d.detalles.map((l) =>
            el('detalle', [opt('codigoInterno', l.codigoInterno), opt('codigoAdicional', l.codigoAdicional), el('descripcion', l.descripcion), el('cantidad', quantity(l.cantidad)), detallesAdicionalesXml(l.detallesAdicionales)]),
          ),
        ),
      ]),
    ),
  );
  return { claveAcceso: tributaria.claveAcceso, xml: document('guiaRemision', GUIA_REMISION_VERSION, [tributaria.xml, info, dest, maquinaFiscalXml(input.maquinaFiscal), infoAdicionalXml(input.infoAdicional)]) };
}
