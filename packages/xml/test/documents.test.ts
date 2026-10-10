import { describe, expect, it } from 'vitest';
import { parseAccessKey } from '@ecuador-tax/access-key';
import { buildFacturaXml } from '@ecuador-tax/xml';
import { facturaBase, guiaRemisionBase, liquidacionBase, notaCreditoBase, notaDebitoBase, retencionBase } from '@ecuador-tax/testing';
import { buildGuiaRemisionXml, buildLiquidacionCompraXml, buildNotaCreditoXml, buildNotaDebitoXml, buildRetencionXml } from '@ecuador-tax/xml';

describe('tipos de comprobante', () => {
  it.each([
    ['liquidación', buildLiquidacionCompraXml(liquidacionBase), '03', 'liquidacionCompra'],
    ['nota de crédito', buildNotaCreditoXml(notaCreditoBase), '04', 'notaCredito'],
    ['nota de débito', buildNotaDebitoXml(notaDebitoBase), '05', 'notaDebito'],
    ['guía', buildGuiaRemisionXml(guiaRemisionBase), '06', 'guiaRemision'],
    ['retención', buildRetencionXml(retencionBase), '07', 'comprobanteRetencion'],
  ])('%s: código de documento y raíz', (_n, r, cod, root) => {
    const p = parseAccessKey(r.claveAcceso);
    expect(p.ok && p.value.tipoComprobante).toBe(cod);
    expect(r.xml).toContain(`<codDoc>${cod}</codDoc>`);
    expect(r.xml).toContain(`<${root} id="comprobante"`);
  });

  it('nota de crédito calcula valorModificacion', () => {
    expect(buildNotaCreditoXml(notaCreditoBase).xml).toContain('<valorModificacion>11.50</valorModificacion>');
  });
  it('nota de débito calcula valorTotal y valida pagos', () => {
    expect(buildNotaDebitoXml(notaDebitoBase).xml).toContain('<valorTotal>11.50</valorTotal>');
    expect(() => buildNotaDebitoXml({ ...notaDebitoBase, pagos: [{ formaPago: '01', total: '11' }] })).toThrow(/pagos/);
  });
  it('rechaza número de documento modificado mal formado', () => {
    expect(() => buildNotaCreditoXml({ ...notaCreditoBase, documentoModificado: { ...notaCreditoBase.documentoModificado, numero: '1-1-1' } })).toThrow(/formato/);
  });
  it('retención valida valorRetenido', () => {
    const d = retencionBase.docsSustento[0]!;
    const r = { ...d.retenciones[0]!, valorRetenido: '9.99' };
    expect(() => buildRetencionXml({ ...retencionBase, docsSustento: [{ ...d, retenciones: [r] }] })).toThrow(/valorRetenido/);
  });
  it('guía valida fechas y destinatarios', () => {
    expect(() => buildGuiaRemisionXml({ ...guiaRemisionBase, fechaFinTransporte: new Date(2026, 9, 1) })).toThrow(/fechaFin/);
    expect(() => buildGuiaRemisionXml({ ...guiaRemisionBase, destinatarios: [] })).toThrow(/destinatario/);
  });
  it('liquidación solo admite IVA', () => {
    const l = liquidacionBase.detalles[0]!;
    expect(() => buildLiquidacionCompraXml({ ...liquidacionBase, detalles: [{ ...l, impuestos: [{ codigo: '3', codigoPorcentaje: '3011', tarifa: '10', baseImponible: '100', valor: '10' }] }], pagos: [{ formaPago: '01', total: '110' }] })).toThrow(/IVA/);
  });
  it('emisor: RUC debe terminar en 001 (XSD) y límite de campos adicionales', () => {
    expect(() => buildNotaCreditoXml({ ...notaCreditoBase, emisor: { ...facturaBase.emisor, ruc: '1790016919002' } })).toThrow(/001/);
    const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, 'v']));
    expect(() => buildNotaCreditoXml({ ...notaCreditoBase, infoAdicional: many })).toThrow(/máximo 15/);
  });
});

describe('reglas de la ficha técnica (revisión)', () => {
  const l = facturaBase.detalles[0]!;
  const iva = l.impuestos[0]!;
  const f = (over: object) => buildFacturaXml({ ...facturaBase, ...over });
  it('IVA: tarifa ↔ código y valor ≈ base × tarifa', () => {
    expect(() => f({ detalles: [{ ...l, impuestos: [{ ...iva, valor: '0.01' }] }], pagos: [{ formaPago: '01', total: '20.01' }] })).toThrow(/valor del IVA/);
    expect(() => f({ detalles: [{ ...l, impuestos: [{ ...iva, codigoPorcentaje: '0' }] }] })).toThrow(/tarifa/);
  });
  it('línea: impuestos repetidos o sin IVA', () => {
    expect(() => f({ detalles: [{ ...l, impuestos: [iva, iva] }] })).toThrow(/repetir/);
    expect(() => f({ detalles: [{ ...l, impuestos: [{ codigo: '3', codigoPorcentaje: '3011', tarifa: '10', baseImponible: '20', valor: '2' }] }] })).toThrow(/IVA/);
  });
  it('detAdicional con caracteres de control falla', () => {
    expect(() => f({ detalles: [{ ...l, detallesAdicionales: [{ nombre: 'a', valor: 'x\u0001' }] }] })).toThrow(RangeError);
  });
  it('\\r suelto en texto falla', () => expect(() => f({ comprador: { ...facturaBase.comprador, razonSocial: 'A\rB' } })).toThrow(/saltos/));
  it('consumidor final: 9999999999999, máx 50 USD, no válido en otros comprobantes', () => {
    const cf = { tipoIdentificacion: '07', identificacion: '123', razonSocial: 'CONSUMIDOR FINAL' } as const;
    expect(() => f({ comprador: cf })).toThrow(/9999999999999/);
    expect(f({ comprador: { ...cf, identificacion: '9999999999999' } }).xml).toContain('<tipoIdentificacionComprador>07<');
    const big = { ...l, cantidad: '5', precioUnitario: '10', precioTotalSinImpuesto: '50', impuestos: [{ ...iva, baseImponible: '50', valor: '7.50' }] };
    expect(() => f({ comprador: { ...cf, identificacion: '9999999999999' }, detalles: [big], pagos: [{ formaPago: '01', total: '57.50' }] })).toThrow(/50 USD/);
    expect(() => buildNotaCreditoXml({ ...notaCreditoBase, comprador: { ...cf, identificacion: '9999999999999' } })).toThrow(/consumidor final/);
    expect(() => buildLiquidacionCompraXml({ ...liquidacionBase, proveedor: { ...cf, identificacion: '9999999999999' } })).toThrow(/consumidor final/);
  });
  it('propina máx 10 % del subtotal', () => {
    expect(() => f({ propina: '15', pagos: [{ formaPago: '01', total: '38' }] })).toThrow(/10 %/);
  });
  it('tolerancia por línea con redondeo half up', () => {
    expect(() => f({ detalles: [{ ...l, cantidad: '1', precioUnitario: '0.129', precioTotalSinImpuesto: '0.11', impuestos: [{ ...iva, baseImponible: '0.11', valor: '0.02' }] }], pagos: [{ formaPago: '01', total: '0.13' }] })).toThrow(/cantidad/);
  });
  it('guía: inicio antes de emisión falla; mismo día en horas invertidas pasa', () => {
    expect(() => buildGuiaRemisionXml({ ...guiaRemisionBase, fechaIniTransporte: new Date(2000, 0, 1), fechaFinTransporte: new Date(2000, 0, 2) })).toThrow(/emisión/);
    expect(buildGuiaRemisionXml({ ...guiaRemisionBase, fechaIniTransporte: new Date(2026, 9, 10, 15), fechaFinTransporte: new Date(2026, 9, 10, 9) }).xml).toContain('<fechaIniTransporte>10/10/2026');
  });
  it('retención: pago al exterior, tipo 08 sin tipoSujeto y pagos negativos', () => {
    const d = retencionBase.docsSustento[0]!;
    expect(() => buildRetencionXml({ ...retencionBase, docsSustento: [{ ...d, pagoLocExt: '02' }] })).toThrow(/tipoRegi/);
    expect(() => buildRetencionXml({ ...retencionBase, sujetoRetenido: { ...retencionBase.sujetoRetenido, tipoIdentificacion: '08' } })).toThrow(/tipoSujeto/);
    expect(() => buildRetencionXml({ ...retencionBase, docsSustento: [{ ...d, pagos: [{ formaPago: '01', total: '-5' }] }] })).toThrow(/no negativo/);
  });
  it('nota de débito: pagos obligatorios y tarifas mezcladas', () => {
    expect(() => buildNotaDebitoXml({ ...notaDebitoBase, pagos: [] })).toThrow(/pago/);
    const r = buildNotaDebitoXml({
      ...notaDebitoBase,
      motivos: [{ razon: 'a', valor: '10' }, { razon: 'b', valor: '5' }],
      impuestos: [{ codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '10', valor: '1.50' }, { codigo: '2', codigoPorcentaje: '0', tarifa: '0', baseImponible: '5', valor: '0' }],
      pagos: [{ formaPago: '01', total: '16.50' }],
    });
    expect(r.xml).toContain('<valorTotal>16.50</valorTotal>');
  });
});
