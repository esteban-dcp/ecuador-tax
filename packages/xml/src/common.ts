import { ValidationError, formatDecimal, formatFechaSri, type Ambiente, type TipoComprobante } from '@ecuador-tax/core';
import { generateAccessKey } from '@ecuador-tax/access-key';
import { el, opt } from './xml-writer.js';
import { CATALOGOS_POR_DEFECTO, FORMAS_PAGO, RIMPE_TEXTOS, type Catalogos } from './tables.js';

export const bad = (code: string, message: string) => new ValidationError(code, message);

/** Tipo de identificación (tabla 6 de la ficha técnica): 04 RUC, 05 cédula, 06 pasaporte, 07 consumidor final, 08 exterior. */
export type TipoIdentificacion = '04' | '05' | '06' | '07' | '08';

export interface Emisor {
  readonly ruc: string;
  readonly razonSocial: string;
  readonly nombreComercial?: string;
  readonly establecimiento: string;
  readonly puntoEmision: string;
  readonly direccionMatriz: string;
  readonly direccionEstablecimiento?: string;
  readonly contribuyenteEspecial?: string;
  readonly obligadoContabilidad?: boolean;
  /** Número de resolución de agente de retención (solo dígitos, máx. 8). */
  readonly agenteRetencion?: string;
  /**
   * Leyenda RIMPE (Anexo 22). Nota: el XSD oficial de febrero de 2022 solo admite la primera; la ficha v2.34
   * admite también la de negocio popular.
   */
  readonly contribuyenteRimpe?: (typeof RIMPE_TEXTOS)[number];
}

export interface ImpuestoLinea {
  /** Código de impuesto: 2 IVA, 3 ICE, 5 IRBPNR. */
  readonly codigo: string;
  /** Código de porcentaje según la tabla vigente de la ficha técnica. */
  readonly codigoPorcentaje: string;
  readonly tarifa: string;
  readonly baseImponible: string;
  readonly valor: string;
}

export interface Pago {
  /** Forma de pago (tabla 24), p. ej. "01" sin utilización del sistema financiero. */
  readonly formaPago: string;
  readonly total: string;
  /** Plazo de crédito (numérico) y su unidad, p. ej. "30" / "dias". */
  readonly plazo?: string;
  readonly unidadTiempo?: string;
}

export interface DetalleAdicional {
  readonly nombre: string;
  readonly valor: string;
}

export const MAX = { texto: 300, codigo: 25, campoAdicional: 15, detAdicional: 3 } as const;

export const cents = (v: string): bigint => BigInt(formatDecimal(v, 2).replace('.', ''));
export const centsToString = (c: bigint): string => {
  const abs = c < 0n ? -c : c;
  return `${c < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};
export const money = (v: string): string => formatDecimal(v, 2);

const NON_NEGATIVE = /^\d+(\.\d+)?$/;
export function nonNegative(name: string, v: string): void {
  if (!NON_NEGATIVE.test(v.trim())) throw bad('AMOUNT_NEGATIVE_OR_INVALID', `${name} debe ser un decimal no negativo: "${v}"`);
}

export function requireText(name: string, v: string, max: number): void {
  if (v.trim() === '') throw bad('FIELD_REQUIRED', `${name} es obligatorio`);
  if (v.length > max) throw bad('FIELD_TOO_LONG', `${name} excede ${max} caracteres`);
  if (/[\r\n]/.test(v)) throw bad('FIELD_NEWLINE', `${name} no admite saltos de línea`);
}

/** cantidad / precio: de 2 a 6 decimales (ficha 1.1.0): se quitan ceros sobrantes pero se conservan 2 decimales mínimo. */
export function quantity(v: string, maxDecimals = 6): string {
  return formatDecimal(v, maxDecimals).replace(/(\.\d{2}\d*?)0+$/, '$1');
}

/** cantidad × precioUnitario − descuento ≈ total (tolerancia de 1 centavo). */
export function lineTotalMatches(cantidad: string, precio: string, descuento: string, total: string): boolean {
  const micro = (v: string) => BigInt(formatDecimal(v, 6).replace('.', ''));
  const gross = micro(cantidad) * micro(precio); // escala 1e12
  const net = gross - micro(descuento) * 1_000_000n;
  const expected = (net + 5_000_000_000n) / 10_000_000_000n; // half up a centavos
  const diff = expected - cents(total);
  return diff >= -1n && diff <= 1n;
}

export interface TaxGroup {
  codigo: string;
  codigoPorcentaje: string;
  tarifa: string;
  base: bigint;
  valor: bigint;
}

export function groupTaxes(impuestos: readonly ImpuestoLinea[]): TaxGroup[] {
  const m = new Map<string, TaxGroup>();
  for (const t of impuestos) {
    const k = `${t.codigo}|${t.codigoPorcentaje}`;
    const g = m.get(k) ?? { codigo: t.codigo, codigoPorcentaje: t.codigoPorcentaje, tarifa: t.tarifa, base: 0n, valor: 0n };
    g.base += cents(t.baseImponible);
    g.valor += cents(t.valor);
    m.set(k, g);
  }
  return [...m.values()];
}

/** Tabla 17 (ficha técnica): código de porcentaje de IVA → tarifa en %. El código 8 (diferenciado) es variable. */
const IVA_TARIFAS: Readonly<Record<string, number | null>> = { '0': 0, '2': 12, '3': 14, '4': 15, '5': 5, '6': 0, '7': 0, '8': null, '10': 13 };

/** Valida cada impuesto: no negativos, tarifa ↔ código (IVA) y valor ≈ base × tarifa (IVA, ±1 centavo). */
export function validateTaxItems(at: string, impuestos: readonly ImpuestoLinea[], cat: Catalogos = CATALOGOS_POR_DEFECTO): void {
  for (const t of impuestos) {
    nonNegative(`${at}.impuesto.valor`, t.valor);
    nonNegative(`${at}.impuesto.baseImponible`, t.baseImponible);
    nonNegative(`${at}.impuesto.tarifa`, t.tarifa);
    if (t.codigo === '3' && !cat.ice.has(t.codigoPorcentaje)) throw bad('TAX_ICE_CODE', `${at}: código de ICE desconocido: ${t.codigoPorcentaje} (tabla 18)`);
    if (t.codigo === '5' && !cat.irbpnr.has(t.codigoPorcentaje)) throw bad('TAX_IRBPNR_CODE', `${at}: código de IRBPNR desconocido: ${t.codigoPorcentaje}`);
    if (!['2', '3', '5'].includes(t.codigo)) throw bad('TAX_CODE', `${at}: código de impuesto desconocido: ${t.codigo} (2 IVA, 3 ICE, 5 IRBPNR)`);
    if (t.codigo !== '2') continue;
    if (!(t.codigoPorcentaje in IVA_TARIFAS)) throw bad('TAX_CODE', `${at}: codigoPorcentaje de IVA desconocido: ${t.codigoPorcentaje}`);
    const esperada = IVA_TARIFAS[t.codigoPorcentaje];
    const tarifa = cents(t.tarifa);
    if (esperada !== null && esperada !== undefined && tarifa !== BigInt(esperada) * 100n) {
      throw bad('TAX_RATE', `${at}: tarifa ${t.tarifa}% no corresponde al codigoPorcentaje ${t.codigoPorcentaje} (${esperada}%)`);
    }
    const esperado = (cents(t.baseImponible) * tarifa + 5_000n) / 10_000n;
    const diff = esperado - cents(t.valor);
    if (diff < -1n || diff > 1n) throw bad('TAX_VALUE', `${at}: valor del IVA no coincide con baseImponible × tarifa`);
  }
}

/** Impuestos de una línea: sin códigos repetidos, un único IVA si `requireIva`, base del IVA = total + ICE. */
export function validateTaxLine(at: string, impuestos: readonly ImpuestoLinea[], lineTotal: bigint, requireIva = true, cat: Catalogos = CATALOGOS_POR_DEFECTO): void {
  validateTaxItems(at, impuestos, cat);
  const codes = impuestos.map((t) => t.codigo);
  if (new Set(codes).size !== codes.length) throw bad('LINE_TAX_DUP', `${at}: no se puede repetir un código de impuesto en la misma línea`);
  if (requireIva && !codes.includes('2')) throw bad('LINE_TAX_NO_IVA', `${at}: cada línea requiere IVA (código 2)`);
  const ice = impuestos.filter((t) => t.codigo === '3').reduce((a, t) => a + cents(t.valor), 0n);
  for (const t of impuestos) {
    if (t.codigo === '2' && cents(t.baseImponible) !== lineTotal + ice) {
      throw bad('LINE_TAX_BASE', `${at}: baseImponible del IVA debe igualar precioTotalSinImpuesto (+ ICE de la línea)`);
    }
  }
}

/** Reglas de identificación (ficha, tabla 6): consumidor final = 13 nueves; solo factura lo admite. */
export function validateIdentificacion(at: string, tipo: TipoIdentificacion, id: string, allowConsumidorFinal: boolean): void {
  if (tipo === '07') {
    if (!allowConsumidorFinal) throw bad('ID_CONSUMIDOR_FINAL', `${at}: el tipo 07 (consumidor final) no está habilitado en este comprobante`);
    if (id !== '9999999999999') throw bad('ID_CONSUMIDOR_FINAL', `${at}: consumidor final debe usar 9999999999999`);
  }
}

export function validatePagos(pagos: readonly Pago[], importeTotal: bigint, required = true, checkForma = true): void {
  if (pagos.length === 0) {
    if (required) throw bad('NO_PAYMENTS', 'se requiere al menos un pago');
    return;
  }
  for (const p of pagos) {
    nonNegative('pago.total', p.total);
    if (checkForma && !FORMAS_PAGO.has(p.formaPago)) throw bad('PAGO_FORMA', `formaPago desconocida: ${p.formaPago} (tabla 24: 01, 15-21)`);
    if (p.plazo !== undefined) nonNegative('pago.plazo', p.plazo);
  }
  const pagado = pagos.reduce((a, p) => a + cents(p.total), 0n);
  if (pagado !== importeTotal) {
    throw bad('PAYMENT_MISMATCH', `la suma de pagos (${pagado}) no coincide con el total (${importeTotal}) en centavos`);
  }
}

export function validateEmisor(e: Emisor): void {
  requireText('emisor.razonSocial', e.razonSocial, MAX.texto);
  requireText('emisor.direccionMatriz', e.direccionMatriz, MAX.texto);
  if (!/^\d{10}001$/.test(e.ruc)) throw bad('EMISOR_RUC', 'emisor.ruc debe tener 13 dígitos y terminar en 001 (esquema XSD del SRI)');
  if (e.contribuyenteRimpe !== undefined && !RIMPE_TEXTOS.includes(e.contribuyenteRimpe)) throw bad('EMISOR_RIMPE', 'contribuyenteRimpe: texto no admitido (Anexo 22)');
  if (e.agenteRetencion !== undefined && !/^[1-9]\d{0,7}$/.test(e.agenteRetencion)) throw bad('EMISOR_AGENTE', 'agenteRetencion: solo dígitos sin ceros a la izquierda, máximo 8 (Anexo 21)');
  if (e.contribuyenteEspecial !== undefined && !/^[A-Za-z0-9]{3,13}$/.test(e.contribuyenteEspecial)) {
    throw bad('EMISOR_ESPECIAL', 'contribuyenteEspecial: 3 a 13 caracteres alfanuméricos');
  }
}

export interface ClaveParams {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string | undefined;
}

export function infoTributaria(tipo: TipoComprobante, e: Emisor, p: ClaveParams): { claveAcceso: string; xml: string } {
  validateEmisor(e);
  const key = generateAccessKey({
    fechaEmision: p.fechaEmision,
    tipoComprobante: tipo,
    ruc: e.ruc,
    ambiente: p.ambiente,
    establecimiento: e.establecimiento,
    puntoEmision: e.puntoEmision,
    secuencial: p.secuencial,
    ...(p.codigoNumerico !== undefined ? { codigoNumerico: p.codigoNumerico } : {}),
  });
  if (!key.ok) throw key.error;
  const xml = el('infoTributaria', [
    el('ambiente', p.ambiente),
    el('tipoEmision', '1'),
    el('razonSocial', e.razonSocial),
    opt('nombreComercial', e.nombreComercial),
    el('ruc', e.ruc),
    el('claveAcceso', key.value),
    el('codDoc', tipo),
    el('estab', e.establecimiento),
    el('ptoEmi', e.puntoEmision),
    el('secuencial', p.secuencial),
    el('dirMatriz', e.direccionMatriz),
    opt('agenteRetencion', e.agenteRetencion),
    opt('contribuyenteRimpe', e.contribuyenteRimpe),
  ]);
  return { claveAcceso: key.value, xml };
}

export const obligado = (e: Emisor): string | undefined =>
  e.obligadoContabilidad === undefined ? undefined : el('obligadoContabilidad', e.obligadoContabilidad ? 'SI' : 'NO');

export const fecha = (d: Date): string => formatFechaSri(d);

export function infoAdicionalXml(info: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!info) return undefined;
  const entries = Object.entries(info);
  if (entries.length === 0) return undefined;
  if (entries.length > MAX.campoAdicional) throw bad('INFO_ADICIONAL_COUNT', `infoAdicional admite máximo ${MAX.campoAdicional} campos`);
  return el(
    'infoAdicional',
    entries.map(([k, v]) => {
      requireText('infoAdicional.nombre', k, MAX.texto);
      requireText(`infoAdicional.${k}`, v, MAX.texto);
      return el('campoAdicional', v, { nombre: k });
    }),
  );
}

export function detallesAdicionalesXml(d: readonly DetalleAdicional[] | undefined, min = 1): string | undefined {
  if (!d || d.length === 0) return undefined;
  if (d.length < min || d.length > MAX.detAdicional) throw bad('DET_ADICIONAL_COUNT', `detallesAdicionales admite de ${min} a ${MAX.detAdicional} elementos`);
  return el(
    'detallesAdicionales',
    d.map((x) => {
      requireText('detAdicional.nombre', x.nombre, MAX.texto);
      requireText('detAdicional.valor', x.valor, MAX.texto);
      return el('detAdicional', [], { nombre: x.nombre, valor: x.valor });
    }),
  );
}

export function document(root: string, version: string, children: readonly (string | undefined)[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' + el(root, children, { id: 'comprobante', version });
}

export const impuestoXml = (t: ImpuestoLinea): string =>
  el('impuesto', [el('codigo', t.codigo), el('codigoPorcentaje', t.codigoPorcentaje), el('tarifa', money(t.tarifa)), el('baseImponible', money(t.baseImponible)), el('valor', money(t.valor))]);

export const pagosXml = (pagos: readonly Pago[]): string =>
  el(
    'pagos',
    pagos.map((p) => el('pago', [el('formaPago', p.formaPago), el('total', money(p.total)), p.plazo === undefined ? undefined : el('plazo', money(p.plazo)), opt('unidadTiempo', p.unidadTiempo)])),
  );

export interface DocumentXml {
  readonly claveAcceso: string;
  /** XML sin firmar. */
  readonly xml: string;
}
