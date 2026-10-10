import { Ambiente } from '@ecuador-tax/core';
import type { FacturaInput, GuiaRemisionInput, LiquidacionCompraInput, NotaCreditoInput, NotaDebitoInput, RetencionInput } from '@ecuador-tax/xml';

/** Factura sintética (datos ficticios) para pruebas. IVA 15 %: 2 × 10.00 + 3.00 = 23.00. */
export const facturaBase: FacturaInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 10),
  secuencial: '000000001',
  codigoNumerico: '12345678',
  emisor: {
    ruc: '1790016919001',
    razonSocial: 'EMPRESA DE PRUEBA S.A.',
    nombreComercial: 'PRUEBA & CIA',
    establecimiento: '001',
    puntoEmision: '001',
    direccionMatriz: 'Av. Siempre Viva 123 <Quito>',
    obligadoContabilidad: true,
  },
  comprador: { tipoIdentificacion: '05', identificacion: '1710034065', razonSocial: 'JUAN PÉREZ' },
  detalles: [
    {
      codigoPrincipal: 'P001',
      descripcion: 'Producto "A"',
      cantidad: '2',
      precioUnitario: '10',
      descuento: '0',
      precioTotalSinImpuesto: '20',
      impuestos: [{ codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '20', valor: '3' }],
    },
  ],
  pagos: [{ formaPago: '01', total: '23' }],
  infoAdicional: { Email: 'a@b.ec' },
};


const IVA15 = { codigo: '2', codigoPorcentaje: '4', tarifa: '15' } as const;

export const liquidacionBase: LiquidacionCompraInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 10),
  secuencial: '000000002',
  codigoNumerico: '23456789',
  emisor: facturaBase.emisor,
  proveedor: { tipoIdentificacion: '05', identificacion: '1710034065', razonSocial: 'PROVEEDOR PRUEBA' },
  detalles: [
    { codigoPrincipal: 'S1', descripcion: 'Servicio', cantidad: '1', precioUnitario: '100', descuento: '0', precioTotalSinImpuesto: '100', impuestos: [{ ...IVA15, baseImponible: '100', valor: '15' }] },
  ],
  pagos: [{ formaPago: '01', total: '115' }],
};

export const notaCreditoBase: NotaCreditoInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 11),
  secuencial: '000000001',
  codigoNumerico: '34567890',
  emisor: facturaBase.emisor,
  comprador: facturaBase.comprador,
  documentoModificado: { codDoc: '01', numero: '001-001-000000001', fechaEmision: new Date(2026, 9, 10) },
  motivo: 'Devolución de mercadería',
  detalles: [
    { codigoInterno: 'P001', descripcion: 'Producto "A"', cantidad: '1', precioUnitario: '10', descuento: '0', precioTotalSinImpuesto: '10', impuestos: [{ ...IVA15, baseImponible: '10', valor: '1.50' }] },
  ],
};

export const notaDebitoBase: NotaDebitoInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 11),
  secuencial: '000000001',
  codigoNumerico: '45678901',
  emisor: facturaBase.emisor,
  comprador: facturaBase.comprador,
  documentoModificado: { codDoc: '01', numero: '001-001-000000001', fechaEmision: new Date(2026, 9, 10) },
  motivos: [{ razon: 'Intereses de mora', valor: '10' }],
  impuestos: [{ ...IVA15, baseImponible: '10', valor: '1.50' }],
  pagos: [{ formaPago: '01', total: '11.50' }],
};

export const retencionBase: RetencionInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 12),
  secuencial: '000000001',
  codigoNumerico: '56789012',
  emisor: facturaBase.emisor,
  sujetoRetenido: { tipoIdentificacion: '04', identificacion: '1790016919001', razonSocial: 'PROVEEDOR SA', parteRelacionada: false },
  periodoFiscal: '10/2026',
  docsSustento: [
    {
      codSustento: '01',
      codDocSustento: '01',
      numDocSustento: '001001000000123',
      fechaEmision: new Date(2026, 9, 10),
      pagoLocExt: '01',
      totalSinImpuestos: '100',
      importeTotal: '115',
      impuestos: [{ codImpuesto: '2', codigoPorcentaje: '4', baseImponible: '100', tarifa: '15', valorImpuesto: '15' }],
      retenciones: [{ codigo: '1', codigoRetencion: '312', baseImponible: '100', porcentajeRetener: '1.75', valorRetenido: '1.75' }],
      pagos: [{ formaPago: '01', total: '113.25' }],
    },
  ],
};

export const guiaRemisionBase: GuiaRemisionInput = {
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(2026, 9, 10),
  secuencial: '000000001',
  codigoNumerico: '67890123',
  emisor: facturaBase.emisor,
  direccionPartida: 'Bodega Central, Quito',
  transportista: { tipoIdentificacion: '05', identificacion: '1710034065', razonSocial: 'TRANSPORTES PRUEBA' },
  fechaIniTransporte: new Date(2026, 9, 10),
  fechaFinTransporte: new Date(2026, 9, 11),
  placa: 'ABC-1234',
  destinatarios: [
    {
      identificacion: '1710034065',
      razonSocial: 'JUAN PÉREZ',
      direccion: 'Av. Amazonas 100, Quito',
      motivoTraslado: 'Venta',
      docSustento: { codDoc: '01', numero: '001-001-000000001', fechaEmision: new Date(2026, 9, 10) },
      detalles: [{ codigoInterno: 'P001', descripcion: 'Producto A', cantidad: '2' }],
    },
  ],
};
