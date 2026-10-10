/** Ambiente del SRI. Códigos según la ficha técnica de comprobantes electrónicos. */
export const Ambiente = { Pruebas: '1', Produccion: '2' } as const;
export type Ambiente = (typeof Ambiente)[keyof typeof Ambiente];

/** Tipo de emisión. Desde 2018 solo existe la emisión normal. */
export const TipoEmision = { Normal: '1' } as const;
export type TipoEmision = (typeof TipoEmision)[keyof typeof TipoEmision];

/** Códigos de tipo de comprobante (tabla 3 de la ficha técnica). */
export const TipoComprobante = {
  Factura: '01',
  LiquidacionCompra: '03',
  NotaCredito: '04',
  NotaDebito: '05',
  GuiaRemision: '06',
  ComprobanteRetencion: '07',
} as const;
export type TipoComprobante = (typeof TipoComprobante)[keyof typeof TipoComprobante];

const TIPOS = new Set<string>(Object.values(TipoComprobante));
export const isTipoComprobante = (v: string): v is TipoComprobante => TIPOS.has(v);

const AMBIENTES = new Set<string>(Object.values(Ambiente));
export const isAmbiente = (v: string): v is Ambiente => AMBIENTES.has(v);
