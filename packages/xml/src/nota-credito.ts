import { TipoComprobante, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import {
  MAX,
  bad,
  centsToString,
  detallesAdicionalesXml,
  document,
  fecha,
  impuestoXml,
  infoAdicionalXml,
  infoTributaria,
  money,
  obligado,
  quantity,
  requireText,
  validateEmisor,
  validateIdentificacion,
  type DetalleAdicional,
  type DocumentXml,
  type Emisor,
  type ImpuestoLinea,
  type TipoIdentificacion,
} from './common.js';
import { totalizar } from './lines.js';
import { compensacionesXml, maquinaFiscalXml, resolverAjustes, totalConImpuestosXml, type AjusteImpuesto, type Compensacion, type MaquinaFiscal } from './extras.js';
import { CATALOGOS_POR_DEFECTO, type Catalogos } from './tables.js';

export const NOTA_CREDITO_VERSION = '1.1.0';

export interface DocumentoModificado {
  /** Código del tipo de comprobante modificado, p. ej. "01" (factura). */
  readonly codDoc: string;
  /** Formato `001-001-000000001`. */
  readonly numero: string;
  readonly fechaEmision: Date;
}

export interface DetalleNotaCredito {
  readonly codigoInterno?: string;
  readonly codigoAdicional?: string;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly precioUnitario: string;
  readonly descuento?: string;
  readonly precioTotalSinImpuesto: string;
  readonly detallesAdicionales?: readonly DetalleAdicional[];
  readonly impuestos: readonly ImpuestoLinea[];
}

export interface NotaCreditoInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string;
  readonly emisor: Emisor;
  readonly comprador: { readonly tipoIdentificacion: TipoIdentificacion; readonly identificacion: string; readonly razonSocial: string };
  readonly documentoModificado: DocumentoModificado;
  readonly motivo: string;
  readonly detalles: readonly DetalleNotaCredito[];
  readonly moneda?: string;
  readonly infoAdicional?: Readonly<Record<string, string>>;
  /** Número de inscripción RISE (máx. 40). */
  readonly rise?: string;
  readonly compensaciones?: readonly Compensacion[];
  /** Devolución automática del IVA (Anexo 20): se resta de `valorModificacion`. */
  readonly ajustesImpuestos?: readonly AjusteImpuesto[];
  readonly maquinaFiscal?: MaquinaFiscal;
  readonly catalogos?: Partial<Catalogos>;
}

export function validateDocumentoModificado(d: DocumentoModificado): void {
  if (!/^\d{2}$/.test(d.codDoc)) throw bad('DOC_MOD_CODE', 'documentoModificado.codDoc debe tener 2 dígitos');
  if (!/^\d{3}-\d{3}-\d{9}$/.test(d.numero)) throw bad('DOC_MOD_NUMBER', 'documentoModificado.numero debe tener formato 001-001-000000001');
}

export function buildNotaCreditoXml(input: NotaCreditoInput): DocumentXml {
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  validateDocumentoModificado(input.documentoModificado);
  requireText('motivo', input.motivo, MAX.texto);
  requireText('comprador.razonSocial', input.comprador.razonSocial, MAX.texto);
  requireText('comprador.identificacion', input.comprador.identificacion, 20);
  const t = totalizar(
    input.detalles.map((d) => ({
      codigoPrincipal: d.codigoInterno ?? 'N/A',
      ...(d.codigoAdicional !== undefined ? { codigoAuxiliar: d.codigoAdicional } : {}),
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      descuento: d.descuento ?? '0',
      precioTotalSinImpuesto: d.precioTotalSinImpuesto,
      impuestos: d.impuestos,
    })),
    false,
    { ...CATALOGOS_POR_DEFECTO, ...(input.catalogos as Partial<Catalogos> | undefined) },
  );
  if (input.rise !== undefined) requireText('rise', input.rise, 40);
  const ajustes = resolverAjustes(input.ajustesImpuestos, t.grupos, input.comprador.tipoIdentificacion, false);
  validateIdentificacion('comprador', input.comprador.tipoIdentificacion, input.comprador.identificacion, false);
  const e = input.emisor;
  const tributaria = infoTributaria(TipoComprobante.NotaCredito, e, input);
  const info = el('infoNotaCredito', [
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
    el('totalSinImpuestos', money(centsToString(t.sinImpuestos))),
    compensacionesXml(input.compensaciones),
    el('valorModificacion', money(centsToString(t.sinImpuestos + t.impuestos - ajustes.devolucionIva))),
    el('moneda', input.moneda ?? 'DOLAR'),
    totalConImpuestosXml(t.grupos, ajustes, { tarifa: false, descuentoAdicional: false }),
    el('motivo', input.motivo),
  ]);
  const detalles = el(
    'detalles',
    input.detalles.map((d) =>
      el('detalle', [
        opt('codigoInterno', d.codigoInterno),
        opt('codigoAdicional', d.codigoAdicional),
        el('descripcion', d.descripcion),
        el('cantidad', quantity(d.cantidad)),
        el('precioUnitario', quantity(d.precioUnitario)),
        d.descuento === undefined ? undefined : el('descuento', money(d.descuento)),
        el('precioTotalSinImpuesto', money(d.precioTotalSinImpuesto)),
        detallesAdicionalesXml(d.detallesAdicionales),
        el('impuestos', d.impuestos.map(impuestoXml)),
      ]),
    ),
  );
  return { claveAcceso: tributaria.claveAcceso, xml: document('notaCredito', NOTA_CREDITO_VERSION, [tributaria.xml, info, detalles, maquinaFiscalXml(input.maquinaFiscal), infoAdicionalXml(input.infoAdicional)]) };
}
