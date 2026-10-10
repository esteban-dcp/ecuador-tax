import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { facturaBase, guiaRemisionBase, liquidacionBase, notaCreditoBase, notaDebitoBase, retencionBase } from '@ecuador-tax/testing';
import {
  buildFacturaXml,
  buildGuiaRemisionXml,
  buildLiquidacionCompraXml,
  buildNotaCreditoXml,
  buildNotaDebitoXml,
  buildRetencionXml,
  validateAgainstXsd,
  type FacturaInput,
  type Reembolso,
} from '@ecuador-tax/xml';

const xsd = (n: string) => fileURLToPath(new URL(`./schemas/${n}`, import.meta.url));
const hasXmllint = (() => {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const valid = async (xml: string, schema: string) => expect(await validateAgainstXsd(xml, xsd(schema))).toEqual([]);

const IVA15 = { codigo: '2', codigoPorcentaje: '4', tarifa: '15' } as const;
const IVA0 = { codigo: '2', codigoPorcentaje: '0', tarifa: '0' } as const;
const line = facturaBase.detalles[0]!;
const maquina = { marca: 'SISPAU', modelo: 'ABC1234', serie: 'CGMC1405' };
const reembolso: Reembolso = {
  tipoIdentificacionProveedor: '04',
  identificacionProveedor: '1760013210001',
  codPaisPagoProveedor: '593',
  tipoProveedor: '01',
  codDoc: '01',
  establecimiento: '001',
  puntoEmision: '501',
  secuencial: '000000008',
  fechaEmision: new Date(2026, 9, 1),
  numeroAutorizacion: '1234567890',
  impuestos: [{ codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponibleReembolso: '100', impuestoReembolso: '15' }],
};
const reembolsoFactura: Reembolso = { ...reembolso, compensaciones: [{ codigo: '1', tarifa: '2', valor: '2' }] };

describe.skipIf(!hasXmllint)('secciones opcionales válidas contra los XSD oficiales', () => {
  const full: FacturaInput = {
    ...facturaBase,
    version: '2.1.0',
    emisor: { ...facturaBase.emisor, agenteRetencion: '12345678', contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE' },
    guiaRemision: '001-001-000000001',
    compensaciones: [{ codigo: '1', tarifa: '2', valor: '0.40' }],
    placa: 'ABC1234',
    valorRetIva: '0.00',
    valorRetRenta: '0.00',
    retenciones: [{ codigo: '4', codigoPorcentaje: '327', tarifa: '0.20', valor: '0.04' }],
    otrosRubrosTerceros: [{ concepto: 'Seguro', total: '5' }],
    tipoNegociable: { correo: 'cliente@ejemplo.ec' },
    maquinaFiscal: maquina,
    infoSustitutivaGuiaRemision: {
      dirPartida: 'Bodega',
      dirDestinatario: 'Av. Amazonas',
      fechaIniTransporte: new Date(2026, 9, 10),
      fechaFinTransporte: new Date(2026, 9, 11),
      razonSocialTransportista: 'TRANSPORTES SA',
      tipoIdentificacionTransportista: '05',
      rucTransportista: '1710034065',
      placa: 'ABC1234',
      destinos: [{ motivoTraslado: 'Venta', codEstabDestino: '001', ruta: 'Quito-Guayaquil' }],
    },
    detalles: [
      { ...line, codigoAuxiliar: 'A1', unidadMedida: 'UND', detallesAdicionales: [{ nombre: 'Marca', valor: 'X & Y' }] },
    ],
    pagos: [{ formaPago: '21', total: '23', plazo: '30', unidadTiempo: 'dias' }],
  };

  it('factura 2.1.0 con todas las secciones', async () => valid(buildFacturaXml(full).xml, 'factura_V2.1.0.xsd'));
  it('factura 2.0.0 (sin retenciones)', async () => {
    const { retenciones: _r, ...sin } = full;
    await valid(buildFacturaXml({ ...sin, version: '2.0.0' }).xml, 'factura_V2.0.0.xsd');
  });

  it('factura de exportación (1.1.0)', async () => {
    const r = buildFacturaXml({
      ...facturaBase,
      detalles: [{ ...line, cantidad: '100', precioUnitario: '2950', precioTotalSinImpuesto: '295000', impuestos: [{ ...IVA0, baseImponible: '295000', valor: '0' }] }],
      pagos: [{ formaPago: '15', total: '297350' }],
      comercioExterior: {
        incoTermFactura: 'FOB',
        lugarIncoTerm: 'Guayaquil',
        paisOrigen: '593',
        puertoEmbarque: 'Guayaquil',
        puertoDestino: 'Hamburgo',
        paisDestino: '202',
        paisAdquisicion: '202',
        incoTermTotalSinImpuestos: 'FOB',
        fleteInternacional: '1000',
        seguroInternacional: '200',
        gastosAduaneros: '800',
        gastosTransporteOtros: '350',
      },
      comprador: { tipoIdentificacion: '08', identificacion: 'DE123456', razonSocial: 'IMPORTER GMBH' },
    });
    expect(r.xml).toContain('<importeTotal>297350.00</importeTotal>');
    await valid(r.xml, 'factura_V1.1.0.xsd');
  });

  it('factura con reembolsos', async () => {
    const r = buildFacturaXml({
      ...facturaBase,
      detalles: [{ ...line, cantidad: '1', precioUnitario: '115', precioTotalSinImpuesto: '115', impuestos: [{ ...IVA0, baseImponible: '115', valor: '0' }] }],
      pagos: [{ formaPago: '01', total: '115' }],
      reembolsos: [reembolsoFactura],
    });
    expect(r.xml).toContain('<codDocReembolso>41</codDocReembolso><totalComprobantesReembolso>115.00<');
    await valid(r.xml, 'factura_V1.1.0.xsd');
  });

  it('factura con subsidio: totalSubsidio = (precioSinSubsidio − precio) × cantidad', async () => {
    const r = buildFacturaXml({
      ...facturaBase,
      detalles: [{ ...line, cantidad: '1', precioUnitario: '25', precioSinSubsidio: '35', precioTotalSinImpuesto: '25', impuestos: [{ ...IVA15, baseImponible: '25', valor: '3.75' }] }],
      pagos: [{ formaPago: '01', total: '28.75' }],
    });
    expect(r.xml).toContain('<totalSubsidio>10.00</totalSubsidio>');
    await valid(r.xml, 'factura_V1.1.0.xsd');
  });

  it('factura con ICE + IVA, IRBPNR y devolución de IVA', async () => {
    const r = buildFacturaXml({
      ...facturaBase,
      detalles: [
        {
          ...line,
          cantidad: '1',
          precioUnitario: '20',
          precioTotalSinImpuesto: '20',
          impuestos: [
            { codigo: '3', codigoPorcentaje: '3610', tarifa: '20', baseImponible: '20', valor: '4' },
            { codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '24', valor: '3.60' },
            { codigo: '5', codigoPorcentaje: '5001', tarifa: '0', baseImponible: '20', valor: '0.02' },
          ],
        },
      ],
      pagos: [{ formaPago: '01', total: '27.62' }],
      ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '4', descuentoAdicional: '0', valorDevolucionIva: '0' }],
    });
    expect(r.xml).toContain('<importeTotal>27.62</importeTotal>');
    await valid(r.xml, 'factura_V1.1.0.xsd');
  });

  it('devolución de IVA resta del importeTotal (Anexo 20)', async () => {
    const r = buildFacturaXml({ ...facturaBase, ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '4', valorDevolucionIva: '1' }], pagos: [{ formaPago: '01', total: '22' }] });
    expect(r.xml).toContain('<importeTotal>22.00</importeTotal>');
    expect(r.xml).toContain('<valorDevolucionIva>1.00</valorDevolucionIva>');
    await valid(r.xml, 'factura_V1.1.0.xsd');
  });

  it('liquidación con reembolsos, negociable y máquina fiscal', async () => {
    const l = liquidacionBase.detalles[0]!;
    const r = buildLiquidacionCompraXml({
      ...liquidacionBase,
      detalles: [{ ...l, unidadMedida: 'UND', impuestos: [{ ...IVA0, baseImponible: '100', valor: '0' }] }],
      pagos: [{ formaPago: '01', total: '100', plazo: '15', unidadTiempo: 'dias' }],
      reembolsos: [reembolso],
      tipoNegociable: { correo: 'p@ejemplo.ec' },
      maquinaFiscal: maquina,
      ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '0', descuentoAdicional: '0' }],
    });
    await valid(r.xml, 'LiquidacionCompra_V1.1.0.xsd');
  });

  it('nota de crédito con rise, compensaciones, DIG y máquina fiscal', async () => {
    const r = buildNotaCreditoXml({
      ...notaCreditoBase,
      rise: 'RISE-123',
      compensaciones: [{ codigo: '1', tarifa: '2', valor: '0.20' }],
      ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '4', valorDevolucionIva: '0.50' }],
      maquinaFiscal: maquina,
      detalles: [{ ...notaCreditoBase.detalles[0]!, detallesAdicionales: [{ nombre: 'Motivo', valor: 'Falla' }] }],
    });
    expect(r.xml).toContain('<valorModificacion>11.00</valorModificacion>');
    await valid(r.xml, 'NotaCredito_V1.1.0.xsd');
  });

  it('nota de débito con rise, compensaciones, DIG y máquina fiscal', async () => {
    const r = buildNotaDebitoXml({
      ...notaDebitoBase,
      rise: 'RISE-1',
      compensaciones: [{ codigo: '1', tarifa: '2', valor: '0.20' }],
      impuestos: [{ ...IVA15, baseImponible: '10', valor: '1.50', valorDevolucionIva: '0.50' }],
      pagos: [{ formaPago: '01', total: '11' }],
      maquinaFiscal: maquina,
    });
    expect(r.xml).toContain('<valorTotal>11.00</valorTotal>');
    await valid(r.xml, 'NotaDebito_V1.0.0.xsd');
  });

  it('guía con rise, máquina fiscal y detalles adicionales', async () => {
    const d = guiaRemisionBase.destinatarios[0]!;
    const r = buildGuiaRemisionXml({
      ...guiaRemisionBase,
      rise: 'RISE-9',
      maquinaFiscal: maquina,
      destinatarios: [{ ...d, docAduaneroUnico: '123', codEstabDestino: '001', ruta: 'Quito-Cuenca', detalles: [{ ...d.detalles[0]!, detallesAdicionales: [{ nombre: 'Lote', valor: 'L1' }] }] }],
    });
    await valid(r.xml, 'GuiaRemision_V1.1.0.xsd');
  });

  it('retención: pago al exterior, dividendos, reembolsos y cajas de banano', async () => {
    const d = retencionBase.docsSustento[0]!;
    const r = buildRetencionXml({
      ...retencionBase,
      sujetoRetenido: { ...retencionBase.sujetoRetenido, tipoIdentificacion: '08', identificacion: 'EXT123', tipoSujeto: '01' },
      maquinaFiscal: maquina,
      docsSustento: [
        {
          ...d,
          codSustento: '10',
          codDocSustento: '41',
          pagoLocExt: '02',
          tipoRegi: '01',
          paisEfecPago: '212',
          aplicConvDobTrib: 'NO',
          pagExtSujRetNorLeg: 'NO',
          pagoRegFis: 'SI',
          numAutDocSustento: '1234567890',
          reembolsos: [reembolso],
          retenciones: [
            { codigo: '1', codigoRetencion: '312', baseImponible: '100', porcentajeRetener: '1.75', valorRetenido: '1.75', dividendos: { fechaPagoDiv: new Date(2026, 9, 1), imRentaSoc: '10', ejerFisUtDiv: '2025' } },
            { codigo: '1', codigoRetencion: '342', baseImponible: '100', porcentajeRetener: '1.00', valorRetenido: '1.00', dividendos: { fechaPagoDiv: new Date(2026, 9, 1), imRentaSoc: '10', ejerFisUtDiv: '2025' }, compraCajBanano: { numCajBan: '2012', precCajBan: '6.5' } },
            { codigo: '2', codigoRetencion: '9', baseImponible: '15', porcentajeRetener: '10', valorRetenido: '1.50', dividendos: { fechaPagoDiv: new Date(2026, 9, 1), imRentaSoc: '10', ejerFisUtDiv: '2025' } },
          ],
        },
      ],
    });
    await valid(r.xml, 'ComprobanteRetencion_V2.0.0.xsd');
  });
});

describe('versiones y reglas de las secciones opcionales', () => {
  it('rechaza secciones que requieren una versión superior', () => {
    expect(() => buildFacturaXml({ ...facturaBase, otrosRubrosTerceros: [{ concepto: 'x', total: '1' }] })).toThrow(/2\.0\.0/);
  });
  it('exportación: INCOTERM y países válidos', () => {
    const ce = { incoTermFactura: 'fob', lugarIncoTerm: 'x', paisOrigen: '593', puertoEmbarque: 'a', puertoDestino: 'b', paisDestino: '202', paisAdquisicion: '202', incoTermTotalSinImpuestos: 'FOB' };
    expect(() => buildFacturaXml({ ...facturaBase, comercioExterior: ce })).toThrow(/INCOTERM/);
    expect(() => buildFacturaXml({ ...facturaBase, comercioExterior: { ...ce, incoTermFactura: 'FOB', paisDestino: '999' } })).toThrow(/país/);
  });
  it('ICE/IRBPNR: códigos desconocidos se rechazan y los catálogos se pueden sustituir', () => {
    const l = facturaBase.detalles[0]!;
    const ice = { codigo: '3', codigoPorcentaje: '3999', tarifa: '10', baseImponible: '20', valor: '2' };
    const iva = { codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '22', valor: '3.30' };
    const input = { ...facturaBase, detalles: [{ ...l, impuestos: [ice, iva] }], pagos: [{ formaPago: '01', total: '25.30' }] };
    expect(() => buildFacturaXml(input)).toThrow(/ICE desconocido/);
    expect(buildFacturaXml({ ...input, catalogos: { ice: new Set(['3999']) } }).xml).toContain('3999');
    expect(() => buildFacturaXml({ ...input, detalles: [{ ...l, impuestos: [{ ...ice, codigo: '5', codigoPorcentaje: '1' }, iva] }] })).toThrow(/IRBPNR/);
  });
  it('DIG: exige cédula y no supera el valor del impuesto', () => {
    const cf = { ...facturaBase.comprador, tipoIdentificacion: '04', identificacion: '1790016919001' } as const;
    expect(() => buildFacturaXml({ ...facturaBase, comprador: cf, ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '4', valorDevolucionIva: '1' }], pagos: [{ formaPago: '01', total: '22' }] })).toThrow(/cédula/);
    expect(() => buildFacturaXml({ ...facturaBase, ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '4', valorDevolucionIva: '9' }] })).toThrow(/no puede superar/);
    expect(() => buildFacturaXml({ ...facturaBase, ajustesImpuestos: [{ codigo: '2', codigoPorcentaje: '0' }] })).toThrow(/inexistente/);
  });
  it('subsidio: precioSinSubsidio ≥ precioUnitario', () => {
    const l = facturaBase.detalles[0]!;
    expect(() => buildFacturaXml({ ...facturaBase, detalles: [{ ...l, precioSinSubsidio: '5' }] })).toThrow(/precioSinSubsidio/);
  });
  it('retención: reglas condicionales del Anexo 10', () => {
    const d = retencionBase.docsSustento[0]!;
    const r = d.retenciones[0]!;
    const build = (over: object) => buildRetencionXml({ ...retencionBase, docsSustento: [{ ...d, ...over }] });
    expect(() => build({ pagoLocExt: '02' })).toThrow(/tipoRegi/);
    expect(() => build({ tipoRegi: '01' })).toThrow(/solo aplican/);
    expect(() => build({ codSustento: '10' })).toThrow(/dividendos/);
    expect(() => build({ codDocSustento: '41' })).toThrow(/reembolsos/);
    expect(() => build({ retenciones: [{ ...r, codigoRetencion: '342' }] })).toThrow(/compraCajBanano/);
    expect(() => build({ retenciones: [{ codigo: '2', codigoRetencion: '9', baseImponible: '15', porcentajeRetener: '20', valorRetenido: '3' }] })).toThrow(/no corresponde al código/);
    expect(() => build({ numAutDocSustento: '123' })).toThrow(/10, 37 o 49/);
  });
  it('compensaciones de reembolso solo en factura', () => {
    expect(() => buildLiquidacionCompraXml({ ...liquidacionBase, reembolsos: [{ tipoIdentificacionProveedor: '04', identificacionProveedor: '1760013210001', codPaisPagoProveedor: '593', tipoProveedor: '01', codDoc: '01', establecimiento: '001', puntoEmision: '001', secuencial: '000000001', fechaEmision: new Date(2026, 9, 1), numeroAutorizacion: '1234567890', impuestos: [{ codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponibleReembolso: '1', impuestoReembolso: '0.15' }], compensaciones: [{ codigo: '1', tarifa: '2', valor: '1' }] }] })).toThrow(/solo existen en la factura/);
  });
  it('máquina fiscal y negociable validan sus campos', () => {
    expect(() => buildFacturaXml({ ...facturaBase, maquinaFiscal: { marca: '', modelo: 'a', serie: 'b' } })).toThrow(/obligatorio/);
    expect(() => buildFacturaXml({ ...facturaBase, tipoNegociable: { correo: 'no-es-correo' } })).toThrow(/correo/);
  });
});

describe('correcciones de la revisión', () => {
  const iva = facturaBase.detalles[0]!.impuestos[0]!;
  it('factura 1.1.0 admite retenciones (código 4) y 2.0.0 no', async () => {
    const ret = [{ codigo: '4', codigoPorcentaje: '327', tarifa: '0.20', valor: '0.04' }] as const;
    const r = buildFacturaXml({ ...facturaBase, retenciones: ret });
    if (hasXmllint) await valid(r.xml, 'factura_V1.1.0.xsd');
    expect(() => buildFacturaXml({ ...facturaBase, version: '2.0.0', retenciones: ret })).toThrow(/2\.0\.0/);
    expect(buildFacturaXml({ ...facturaBase, retenciones: [] }).xml).not.toContain('<retenciones>');
  });
  it('factura 2.0.0 rechaza más de 2 decimales en cantidad/precio', () => {
    const l = facturaBase.detalles[0]!;
    expect(() => buildFacturaXml({ ...facturaBase, version: '2.0.0', detalles: [{ ...l, cantidad: '2.542563', precioUnitario: '10', precioTotalSinImpuesto: '25.43', impuestos: [{ ...iva, baseImponible: '25.43', valor: '3.81' }] }], pagos: [{ formaPago: '01', total: '29.24' }] })).toThrow(/decimales/);
  });
  it('exportación sin paisDestino/paisAdquisicion es válida', async () => {
    const r = buildFacturaXml({ ...facturaBase, detalles: [{ ...facturaBase.detalles[0]!, impuestos: [{ ...IVA0, baseImponible: '20', valor: '0' }] }], pagos: [{ formaPago: '01', total: '20' }], comercioExterior: { incoTermFactura: 'FOB', lugarIncoTerm: 'x', paisOrigen: '593', puertoEmbarque: 'a', puertoDestino: 'b', incoTermTotalSinImpuestos: 'FOB' } });
    if (hasXmllint) await valid(r.xml, 'factura_V1.1.0.xsd');
  });
  it('retención IVA con códigos 5 y 6 (100 %)', () => {
    const d = retencionBase.docsSustento[0]!;
    for (const c of ['5', '6']) {
      const r = buildRetencionXml({ ...retencionBase, docsSustento: [{ ...d, retenciones: [{ codigo: '2', codigoRetencion: c, baseImponible: '10', porcentajeRetener: '100', valorRetenido: '10' }] }] });
      expect(r.xml).toContain(`<codigoRetencion>${c}</codigoRetencion>`);
    }
  });
  it('formaPago desconocida y agenteRetencion con ceros se rechazan', () => {
    expect(() => buildFacturaXml({ ...facturaBase, pagos: [{ formaPago: '05', total: '23' }] })).toThrow(/formaPago/);
    expect(() => buildFacturaXml({ ...facturaBase, emisor: { ...facturaBase.emisor, agenteRetencion: '00123' } })).toThrow(/ceros/);
  });
  it('descuentoAdicional solo en IVA', () => {
    expect(() => buildFacturaXml({ ...facturaBase, ajustesImpuestos: [{ codigo: '3', codigoPorcentaje: '3610', descuentoAdicional: '1' }] })).toThrow();
  });
});
