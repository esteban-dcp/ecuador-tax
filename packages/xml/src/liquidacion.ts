import { TipoComprobante, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import {
  MAX,
  bad,
  centsToString,
  document,
  fecha,
  infoAdicionalXml,
  infoTributaria,
  money,
  obligado,
  pagosXml,
  requireText,
  validateEmisor,
  validateIdentificacion,
  validatePagos,
  type DocumentXml,
  type Emisor,
  type Pago,
  type TipoIdentificacion,
} from './common.js';
import {
  maquinaFiscalXml,
  reembolsoCabeceraXml,
  reembolsosXml,
  resolverAjustes,
  tipoNegociableXml,
  totalConImpuestosXml,
  validateReembolsos,
  type AjusteImpuesto,
  type MaquinaFiscal,
  type Reembolso,
  type TipoNegociable,
} from './extras.js';
import { detallesVentaXml, totalizar, type DetalleVenta } from './lines.js';
import { CATALOGOS_POR_DEFECTO, type Catalogos } from './tables.js';

export const LIQUIDACION_VERSION = '1.1.0';

export interface Proveedor {
  readonly tipoIdentificacion: TipoIdentificacion;
  readonly identificacion: string;
  readonly razonSocial: string;
  readonly direccion?: string;
}

export interface LiquidacionCompraInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string;
  readonly emisor: Emisor;
  readonly proveedor: Proveedor;
  readonly detalles: readonly DetalleVenta[];
  readonly pagos: readonly Pago[];
  readonly moneda?: string;
  readonly infoAdicional?: Readonly<Record<string, string>>;
  /** Reembolsos (codDocReembolso = 41). */
  readonly reembolsos?: readonly Reembolso[];
  /** Descuento adicional por grupo de impuesto. */
  readonly ajustesImpuestos?: readonly AjusteImpuesto[];
  readonly tipoNegociable?: TipoNegociable;
  readonly maquinaFiscal?: MaquinaFiscal;
  readonly catalogos?: Partial<Catalogos>;
}

export function buildLiquidacionCompraXml(input: LiquidacionCompraInput): DocumentXml {
  const cat: Catalogos = { ...CATALOGOS_POR_DEFECTO, ...(input.catalogos as Partial<Catalogos> | undefined) };
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  requireText('proveedor.razonSocial', input.proveedor.razonSocial, MAX.texto);
  requireText('proveedor.identificacion', input.proveedor.identificacion, 20);
  if (input.proveedor.direccion !== undefined) requireText('proveedor.direccion', input.proveedor.direccion, MAX.texto);
  validateIdentificacion('proveedor', input.proveedor.tipoIdentificacion, input.proveedor.identificacion, false);
  const t = totalizar(input.detalles, true, cat);
  if (t.grupos.some((g) => g.codigo !== '2')) throw bad('LIQ_TAX', 'la liquidación de compra solo admite IVA (código 2)');
  if ((input.ajustesImpuestos ?? []).some((a) => a.valorDevolucionIva !== undefined)) throw bad('LIQ_DIG', 'valorDevolucionIva no existe en la liquidación de compra');
  const ajustes = resolverAjustes(input.ajustesImpuestos, t.grupos, input.proveedor.tipoIdentificacion);
  const total = t.sinImpuestos + t.impuestos;
  validatePagos(input.pagos, total);
  const reembolsoTotales = input.reembolsos ? validateReembolsos(input.reembolsos, cat.paises) : undefined;

  const e = input.emisor;
  const tributaria = infoTributaria(TipoComprobante.LiquidacionCompra, e, input);
  const info = el('infoLiquidacionCompra', [
    el('fechaEmision', fecha(input.fechaEmision)),
    opt('dirEstablecimiento', e.direccionEstablecimiento),
    opt('contribuyenteEspecial', e.contribuyenteEspecial),
    obligado(e),
    el('tipoIdentificacionProveedor', input.proveedor.tipoIdentificacion),
    el('razonSocialProveedor', input.proveedor.razonSocial),
    el('identificacionProveedor', input.proveedor.identificacion),
    opt('direccionProveedor', input.proveedor.direccion),
    el('totalSinImpuestos', money(centsToString(t.sinImpuestos))),
    el('totalDescuento', money(centsToString(t.descuento))),
    ...(reembolsoTotales ? reembolsoCabeceraXml(reembolsoTotales) : []),
    totalConImpuestosXml(t.grupos, ajustes),
    el('importeTotal', money(centsToString(total))),
    el('moneda', input.moneda ?? 'DOLAR'),
    pagosXml(input.pagos),
  ]);
  return {
    claveAcceso: tributaria.claveAcceso,
    xml: document('liquidacionCompra', LIQUIDACION_VERSION, [
      tributaria.xml,
      info,
      detallesVentaXml(input.detalles),
      input.reembolsos ? reembolsosXml(input.reembolsos, 'liquidacion') : undefined,
      tipoNegociableXml(input.tipoNegociable),
      maquinaFiscalXml(input.maquinaFiscal),
      infoAdicionalXml(input.infoAdicional),
    ]),
  };
}
