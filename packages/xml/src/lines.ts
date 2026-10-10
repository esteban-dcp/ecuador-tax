import { formatDecimal } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import {
  MAX,
  bad,
  cents,
  detallesAdicionalesXml,
  groupTaxes,
  impuestoXml,
  lineTotalMatches,
  money,
  nonNegative,
  quantity,
  requireText,
  validateTaxLine,
  type DetalleAdicional,
  type ImpuestoLinea,
  type TaxGroup,
} from './common.js';
import type { Catalogos } from './tables.js';

/** Línea de detalle de factura y liquidación de compra. Importes como decimales en texto. */
export interface DetalleVenta {
  readonly codigoPrincipal: string;
  readonly codigoAuxiliar?: string;
  readonly descripcion: string;
  readonly unidadMedida?: string;
  readonly cantidad: string;
  readonly precioUnitario: string;
  /** Precio sin subsidio (factura con subsidio, Anexo 6). Debe ser ≥ precioUnitario. */
  readonly precioSinSubsidio?: string;
  readonly descuento: string;
  readonly precioTotalSinImpuesto: string;
  readonly detallesAdicionales?: readonly DetalleAdicional[];
  readonly impuestos: readonly ImpuestoLinea[];
}

export interface Totales {
  readonly sinImpuestos: bigint;
  readonly descuento: bigint;
  readonly grupos: TaxGroup[];
  readonly impuestos: bigint;
  /** Σ cantidad × (precioSinSubsidio − precioUnitario), en centavos; 0n si ninguna línea tiene subsidio. */
  readonly subsidio: bigint;
  readonly haySubsidio: boolean;
}

export function totalizar(detalles: readonly DetalleVenta[], requireIva = true, cat?: Catalogos, maxDecimals = 6): Totales {
  if (detalles.length === 0) throw bad('NO_LINES', 'se requiere al menos un detalle');
  let sinImpuestos = 0n;
  let descuento = 0n;
  let subsidio = 0n;
  let haySubsidio = false;
  const all: ImpuestoLinea[] = [];
  for (const [i, d] of detalles.entries()) {
    const at = `detalles[${i}]`;
    requireText(`${at}.codigoPrincipal`, d.codigoPrincipal, MAX.codigo);
    if (d.codigoAuxiliar !== undefined) requireText(`${at}.codigoAuxiliar`, d.codigoAuxiliar, MAX.codigo);
    requireText(`${at}.descripcion`, d.descripcion, MAX.texto);
    if (d.impuestos.length === 0) throw bad('LINE_TAX', `${at} requiere al menos un impuesto`);
    if (maxDecimals < 6) {
      for (const [k, v] of [['cantidad', d.cantidad], ['precioUnitario', d.precioUnitario], ['precioSinSubsidio', d.precioSinSubsidio]] as const) {
        if (v !== undefined && new RegExp(`\\.\\d{${maxDecimals + 1},}`).test(v) && !/\.0+$/.test(v)) throw bad('LINE_DECIMALS', `${at}.${k}: esta versión del esquema admite máximo ${maxDecimals} decimales`);
      }
    }
    for (const [k, v] of [['cantidad', d.cantidad], ['precioUnitario', d.precioUnitario], ['descuento', d.descuento], ['precioTotalSinImpuesto', d.precioTotalSinImpuesto]] as const) {
      nonNegative(`${at}.${k}`, v);
    }
    if (!lineTotalMatches(d.cantidad, d.precioUnitario, d.descuento, d.precioTotalSinImpuesto)) {
      throw bad('LINE_TOTAL', `${at}: precioTotalSinImpuesto no coincide con cantidad × precioUnitario − descuento`);
    }
    if (d.precioSinSubsidio !== undefined) {
      nonNegative(`${at}.precioSinSubsidio`, d.precioSinSubsidio);
      const micro = (v: string) => BigInt(formatDecimal(v, 6).replace('.', ''));
      if (micro(d.precioSinSubsidio) < micro(d.precioUnitario)) throw bad('LINE_SUBSIDIO', `${at}: precioSinSubsidio debe ser ≥ precioUnitario`);
      haySubsidio = true;
      subsidio += ((micro(d.precioSinSubsidio) - micro(d.precioUnitario)) * micro(d.cantidad) + 5_000_000_000n) / 10_000_000_000n;
    }
    const total = cents(d.precioTotalSinImpuesto);
    validateTaxLine(at, d.impuestos, total, requireIva, cat);
    sinImpuestos += total;
    descuento += cents(d.descuento);
    all.push(...d.impuestos);
  }
  const grupos = groupTaxes(all);
  return { sinImpuestos, descuento, grupos, impuestos: grupos.reduce((a, g) => a + g.valor, 0n), subsidio, haySubsidio };
}

export const detallesVentaXml = (detalles: readonly DetalleVenta[], maxDecimals = 6): string =>
  el(
    'detalles',
    detalles.map((d) =>
      el('detalle', [
        el('codigoPrincipal', d.codigoPrincipal),
        opt('codigoAuxiliar', d.codigoAuxiliar),
        el('descripcion', d.descripcion),
        opt('unidadMedida', d.unidadMedida),
        el('cantidad', quantity(d.cantidad, maxDecimals)),
        el('precioUnitario', quantity(d.precioUnitario, maxDecimals)),
        d.precioSinSubsidio === undefined ? undefined : el('precioSinSubsidio', quantity(d.precioSinSubsidio, maxDecimals)),
        el('descuento', money(d.descuento)),
        el('precioTotalSinImpuesto', money(d.precioTotalSinImpuesto)),
        detallesAdicionalesXml(d.detallesAdicionales),
        el('impuestos', d.impuestos.map(impuestoXml)),
      ]),
    ),
  );
