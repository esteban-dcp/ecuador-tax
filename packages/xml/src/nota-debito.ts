import { TipoComprobante, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import {
  MAX,
  bad,
  cents,
  centsToString,
  document,
  fecha,
  impuestoXml,
  infoAdicionalXml,
  infoTributaria,
  money,
  nonNegative,
  obligado,
  pagosXml,
  requireText,
  validateEmisor,
  validatePagos,
  validateTaxItems,
  validateIdentificacion,
  type DocumentXml,
  type Emisor,
  type ImpuestoLinea,
  type Pago,
  type TipoIdentificacion,
} from './common.js';
import { compensacionesXml, maquinaFiscalXml, type Compensacion, type MaquinaFiscal } from './extras.js';
import { CATALOGOS_POR_DEFECTO, type Catalogos } from './tables.js';
import { validateDocumentoModificado, type DocumentoModificado } from './nota-credito.js';

export const NOTA_DEBITO_VERSION = '1.0.0';

export interface MotivoNotaDebito {
  readonly razon: string;
  readonly valor: string;
}

/** Impuesto de nota de débito; `valorDevolucionIva` aplica a la devolución automática del IVA (Anexo 20). */
export interface ImpuestoNotaDebito extends ImpuestoLinea {
  readonly valorDevolucionIva?: string;
}

export interface NotaDebitoInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string;
  readonly emisor: Emisor;
  readonly comprador: { readonly tipoIdentificacion: TipoIdentificacion; readonly identificacion: string; readonly razonSocial: string };
  readonly documentoModificado: DocumentoModificado;
  readonly motivos: readonly MotivoNotaDebito[];
  /** Impuestos del documento (a nivel de comprobante, no por línea). */
  readonly impuestos: readonly ImpuestoNotaDebito[];
  readonly pagos: readonly Pago[];
  readonly rise?: string;
  readonly compensaciones?: readonly Compensacion[];
  readonly maquinaFiscal?: MaquinaFiscal;
  readonly catalogos?: Partial<Catalogos>;
  readonly infoAdicional?: Readonly<Record<string, string>>;
}

export function buildNotaDebitoXml(input: NotaDebitoInput): DocumentXml {
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  validateDocumentoModificado(input.documentoModificado);
  requireText('comprador.razonSocial', input.comprador.razonSocial, MAX.texto);
  requireText('comprador.identificacion', input.comprador.identificacion, 20);
  if (input.motivos.length === 0) throw bad('ND_MOTIVOS', 'se requiere al menos un motivo');
  if (input.impuestos.length === 0) throw bad('ND_IMPUESTOS', 'se requiere al menos un impuesto');
  let sinImpuestos = 0n;
  for (const m of input.motivos) {
    requireText('motivo.razon', m.razon, MAX.texto);
    nonNegative('motivo.valor', m.valor);
    sinImpuestos += cents(m.valor);
  }
  validateTaxItems('impuestos', input.impuestos, { ...CATALOGOS_POR_DEFECTO, ...(input.catalogos as Partial<Catalogos> | undefined) });
  if (input.rise !== undefined) requireText('rise', input.rise, 40);
  let devolucion = 0n;
  for (const t of input.impuestos) {
    if (t.valorDevolucionIva === undefined) continue;
    nonNegative('valorDevolucionIva', t.valorDevolucionIva);
    if (t.codigo !== '2') throw bad('ND_DIG', 'valorDevolucionIva solo aplica al IVA (código 2)');
    const v = cents(t.valorDevolucionIva);
    if (v > cents(t.valor)) throw bad('ND_DIG_MAX', 'valorDevolucionIva no puede superar el valor del impuesto (Anexo 20)');
    if (v > 0n && input.comprador.tipoIdentificacion !== '05') throw bad('ND_DIG_ID', 'la devolución del IVA exige comprador con cédula (tipo 05, Anexo 20)');
    devolucion += v;
  }
  validateIdentificacion('comprador', input.comprador.tipoIdentificacion, input.comprador.identificacion, false);
  const ice = input.impuestos.filter((t) => t.codigo === '3').reduce((a, t) => a + cents(t.valor), 0n);
  const baseIva = input.impuestos.filter((t) => t.codigo === '2').reduce((a, t) => a + cents(t.baseImponible), 0n);
  if (baseIva !== sinImpuestos + ice) throw bad('ND_BASE', 'la suma de las bases de IVA debe igualar totalSinImpuestos (+ ICE)');
  const impuestos = input.impuestos.reduce((a, t) => a + cents(t.valor), 0n);
  const valorTotal = sinImpuestos + impuestos - devolucion;
  validatePagos(input.pagos ?? [], valorTotal);  // la ficha marca <pagos> como obligatorio

  const e = input.emisor;
  const tributaria = infoTributaria(TipoComprobante.NotaDebito, e, input);
  const info = el('infoNotaDebito', [
    el('fechaEmision', fecha(input.fechaEmision)),
    opt('dirEstablecimiento', e.direccionEstablecimiento),
    el('tipoIdentificacionComprador', input.comprador.tipoIdentificacion),
    el('razonSocialComprador', input.comprador.razonSocial),
    el('identificacionComprador', input.comprador.identificacion),
    opt('contribuyenteEspecial', e.contribuyenteEspecial),
    obligado(e),
    opt('rise', input.rise),
    el('codDocModificado', input.documentoModificado.codDoc),
    el('numDocModificado', input.documentoModificado.numero),
    el('fechaEmisionDocSustento', fecha(input.documentoModificado.fechaEmision)),
    el('totalSinImpuestos', money(centsToString(sinImpuestos))),
    el(
      'impuestos',
      input.impuestos.map((t) => {
        const base = impuestoXml(t);
        return t.valorDevolucionIva === undefined ? base : base.replace('</impuesto>', `${el('valorDevolucionIva', money(t.valorDevolucionIva))}</impuesto>`);
      }),
    ),
    compensacionesXml(input.compensaciones),
    el('valorTotal', money(centsToString(valorTotal))),
    pagosXml(input.pagos),
  ]);
  const motivos = el('motivos', input.motivos.map((m) => el('motivo', [el('razon', m.razon), el('valor', money(m.valor))])));
  return { claveAcceso: tributaria.claveAcceso, xml: document('notaDebito', NOTA_DEBITO_VERSION, [tributaria.xml, info, motivos, maquinaFiscalXml(input.maquinaFiscal), infoAdicionalXml(input.infoAdicional)]) };
}
