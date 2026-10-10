import { TipoComprobante, formatDecimal, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import {
  MAX,
  bad,
  cents,
  centsToString,
  document,
  fecha,
  infoAdicionalXml,
  infoTributaria,
  money,
  nonNegative,
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
  compensacionesXml,
  maquinaFiscalXml,
  reembolsoCabeceraXml,
  reembolsosXml,
  resolverAjustes,
  tipoNegociableXml,
  totalConImpuestosXml,
  validateReembolsos,
  type AjusteImpuesto,
  type Compensacion,
  type MaquinaFiscal,
  type Reembolso,
  type TipoNegociable,
} from './extras.js';
import { detallesVentaXml, totalizar, type DetalleVenta } from './lines.js';
import { CATALOGOS_POR_DEFECTO, type Catalogos } from './tables.js';


/** Versiones de esquema de factura soportadas. 1.1.0 por defecto. */
export type FacturaVersion = '1.1.0' | '2.0.0' | '2.1.0';
export const FACTURA_VERSION: FacturaVersion = '1.1.0';

export type TipoIdentificacionComprador = TipoIdentificacion;
export type DetalleFactura = DetalleVenta;
export type FacturaXml = DocumentXml;

export interface Comprador {
  readonly tipoIdentificacion: TipoIdentificacion;
  readonly identificacion: string;
  readonly razonSocial: string;
  readonly direccion?: string;
}

/** Factura de exportación (Anexo 4). Todos los campos de INCOTERM y destino son obligatorios en una exportación. */
export interface ComercioExterior {
  /** Término INCOTERM, p. ej. "FOB" (mayúsculas, máx. 10). */
  readonly incoTermFactura: string;
  readonly lugarIncoTerm: string;
  /** Códigos de país de la tabla 25. */
  readonly paisOrigen: string;
  readonly puertoEmbarque: string;
  readonly puertoDestino: string;
  readonly paisDestino?: string;
  readonly paisAdquisicion?: string;
  /** INCOTERM aplicado al total sin impuestos. */
  readonly incoTermTotalSinImpuestos: string;
  readonly fleteInternacional?: string;
  readonly seguroInternacional?: string;
  readonly gastosAduaneros?: string;
  readonly gastosTransporteOtros?: string;
}

/** Retención presuntiva incluida en la factura (versión 2.1.0): codigo siempre "4". */
export interface RetencionFactura {
  readonly codigo: '4';
  readonly codigoPorcentaje: string;
  readonly tarifa: string;
  readonly valor: string;
}

/** Factura sustitutiva de guía de remisión (Anexo 9, versiones 2.x). */
export interface InfoSustitutivaGuiaRemision {
  readonly dirPartida: string;
  readonly dirDestinatario: string;
  readonly fechaIniTransporte: Date;
  readonly fechaFinTransporte: Date;
  readonly razonSocialTransportista: string;
  readonly tipoIdentificacionTransportista: TipoIdentificacion;
  readonly rucTransportista: string;
  readonly placa: string;
  readonly destinos: readonly {
    readonly motivoTraslado: string;
    readonly docAduaneroUnico?: string;
    readonly codEstabDestino?: string;
    readonly ruta?: string;
  }[];
}

export interface RubroTercero {
  readonly concepto: string;
  readonly total: string;
}

export interface FacturaInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  /** 8 dígitos; se genera si se omite. */
  readonly codigoNumerico?: string;
  /** Versión del esquema. Por defecto 1.1.0. Algunas secciones exigen 2.0.0 o 2.1.0. */
  readonly version?: FacturaVersion;
  readonly emisor: Emisor;
  readonly comprador: Comprador;
  readonly detalles: readonly DetalleVenta[];
  readonly propina?: string;
  readonly pagos: readonly Pago[];
  readonly moneda?: string;
  readonly infoAdicional?: Readonly<Record<string, string>>;

  /** Número de guía de remisión `001-001-000000001`. */
  readonly guiaRemision?: string;
  readonly comercioExterior?: ComercioExterior;
  readonly reembolsos?: readonly Reembolso[];
  readonly compensaciones?: readonly Compensacion[];
  /** Descuento adicional y devolución del IVA por grupo de impuesto (Anexo 20). */
  readonly ajustesImpuestos?: readonly AjusteImpuesto[];
  /** Placa del vehículo (venta de combustibles, Anexo 12; transporte, Anexo 25). */
  readonly placa?: string;
  readonly valorRetIva?: string;
  readonly valorRetRenta?: string;
  /** Solo versión 2.1.0. */
  readonly retenciones?: readonly RetencionFactura[];
  /** Solo versiones 2.x. */
  readonly infoSustitutivaGuiaRemision?: InfoSustitutivaGuiaRemision;
  /** Solo versiones 2.x. No se suman a ningún total: la ficha no define su relación con importeTotal. */
  readonly otrosRubrosTerceros?: readonly RubroTercero[];
  readonly tipoNegociable?: TipoNegociable;
  readonly maquinaFiscal?: MaquinaFiscal;
  /** Sustituye los catálogos de ICE/IRBPNR/países si la ficha cambió. */
  readonly catalogos?: Partial<Catalogos>;
}

const NUM_DOC = /^\d{3}-\d{3}-\d{9}$/;
const INCOTERM = /^[A-Z]{1,10}$/;

function versionOf(i: FacturaInput): FacturaVersion {
  const v = i.version ?? FACTURA_VERSION;
  if (!['1.1.0', '2.0.0', '2.1.0'].includes(v)) throw bad('FACTURA_VERSION', `versión de factura no soportada: ${String(v)}`);
  return v;
}

function money2(v: string | undefined): bigint {
  return v === undefined ? 0n : cents(v);
}

function validateComercioExterior(c: ComercioExterior, catalogos: Catalogos): void {
  for (const k of ['incoTermFactura', 'incoTermTotalSinImpuestos'] as const) {
    if (!INCOTERM.test(c[k])) throw bad('EXPORT_INCOTERM', `comercioExterior.${k} debe ser un INCOTERM en mayúsculas (máx. 10 letras)`);
  }
  requireText('comercioExterior.lugarIncoTerm', c.lugarIncoTerm, MAX.texto);
  requireText('comercioExterior.puertoEmbarque', c.puertoEmbarque, MAX.texto);
  requireText('comercioExterior.puertoDestino', c.puertoDestino, MAX.texto);
  for (const k of ['paisOrigen', 'paisDestino', 'paisAdquisicion'] as const) {
    const v = c[k];
    if (v !== undefined && !(v in catalogos.paises)) throw bad('EXPORT_PAIS', `comercioExterior.${k}: código de país desconocido (${v}, tabla 25)`);
  }
  for (const k of ['fleteInternacional', 'seguroInternacional', 'gastosAduaneros', 'gastosTransporteOtros'] as const) {
    if (c[k] !== undefined) nonNegative(`comercioExterior.${k}`, c[k]);
  }
}

function resolveCatalogos(i: FacturaInput): Catalogos {
  return { ...CATALOGOS_POR_DEFECTO, ...(i.catalogos as Partial<Catalogos> | undefined) };
}

interface Calculado {
  readonly t: ReturnType<typeof totalizar>;
  readonly ajustes: ReturnType<typeof resolverAjustes>;
  readonly exportCostos: bigint;
  readonly importeTotal: bigint;
  readonly reembolsoTotales: ReturnType<typeof validateReembolsos> | undefined;
}

function calcular(input: FacturaInput): Calculado {
  const version = versionOf(input);
  const cat = resolveCatalogos(input);
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  requireText('comprador.razonSocial', input.comprador.razonSocial, MAX.texto);
  requireText('comprador.identificacion', input.comprador.identificacion, 20);
  if (input.comprador.direccion !== undefined) requireText('comprador.direccion', input.comprador.direccion, MAX.texto);
  nonNegative('propina', input.propina ?? '0');
  validateIdentificacion('comprador', input.comprador.tipoIdentificacion, input.comprador.identificacion, true);
  if (input.guiaRemision !== undefined && !NUM_DOC.test(input.guiaRemision)) throw bad('FACTURA_GUIA', 'guiaRemision debe tener formato 001-001-000000001');
  if (input.placa !== undefined) requireText('placa', input.placa, 20);
  for (const k of ['valorRetIva', 'valorRetRenta'] as const) if (input[k] !== undefined) nonNegative(k, input[k]);

  if (version === '2.0.0' && input.retenciones?.length) throw bad('FACTURA_VERSION_FEATURE', 'retenciones no existe en la versión 2.0.0 (use 1.1.0 o 2.1.0)');
  if (version === '1.1.0' && (input.infoSustitutivaGuiaRemision || input.otrosRubrosTerceros?.length)) {
    throw bad('FACTURA_VERSION_FEATURE', 'infoSustitutivaGuiaRemision y otrosRubrosTerceros requieren la versión 2.0.0 o superior');
  }

  const t = totalizar(input.detalles, true, cat, version === '2.0.0' ? 2 : 6);
  const ajustes = resolverAjustes(input.ajustesImpuestos, t.grupos, input.comprador.tipoIdentificacion);
  if (input.comercioExterior) validateComercioExterior(input.comercioExterior, cat);
  const ce = input.comercioExterior;
  const exportCostos = money2(ce?.fleteInternacional) + money2(ce?.seguroInternacional) + money2(ce?.gastosAduaneros) + money2(ce?.gastosTransporteOtros);

  const propina = cents(input.propina ?? '0');
  if (propina * 10n > t.sinImpuestos) throw bad('PROPINA_LIMIT', 'la propina no puede superar el 10 % del subtotal (ficha técnica, tabla 21)');
  // Anexo 4: importeTotal = subtotal + impuestos + propina + flete + seguro + gastos aduaneros + otros; Anexo 20: − devolución IVA.
  const importeTotal = t.sinImpuestos + t.impuestos + propina + exportCostos - ajustes.devolucionIva;
  if (input.comprador.tipoIdentificacion === '07' && importeTotal > 5000n) {
    throw bad('CONSUMIDOR_FINAL_LIMIT', 'una factura a consumidor final no puede superar 50 USD (ficha técnica, numeral 9.10): identifique al adquirente');
  }
  validatePagos(input.pagos, importeTotal);

  const reembolsoTotales = input.reembolsos ? validateReembolsos(input.reembolsos, cat.paises) : undefined;

  for (const r of input.retenciones ?? []) {
    if (r.codigo !== '4') throw bad('FACTURA_RET', 'retenciones: el código debe ser "4"');
    for (const [k, v] of [['tarifa', r.tarifa], ['valor', r.valor]] as const) nonNegative(`retencion.${k}`, v);
    if (!/^\d{1,3}$/.test(r.codigoPorcentaje)) throw bad('FACTURA_RET', 'retenciones.codigoPorcentaje debe tener de 1 a 3 dígitos');
  }
  if (input.otrosRubrosTerceros) {
    if (input.otrosRubrosTerceros.length === 0) throw bad('RUBROS_EMPTY', 'otrosRubrosTerceros requiere al menos un rubro');
    for (const r of input.otrosRubrosTerceros) {
      requireText('rubro.concepto', r.concepto, MAX.texto);
      nonNegative('rubro.total', r.total);
    }
  }
  const s = input.infoSustitutivaGuiaRemision;
  if (s) {
    for (const k of ['dirPartida', 'dirDestinatario', 'razonSocialTransportista', 'rucTransportista', 'placa'] as const) requireText(`infoSustitutivaGuiaRemision.${k}`, s[k], k === 'rucTransportista' || k === 'placa' ? 20 : MAX.texto);
    if (s.destinos.length === 0) throw bad('SUSTITUTIVA_DESTINOS', 'infoSustitutivaGuiaRemision requiere al menos un destino');
    const day = (d: Date) => d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
    if (day(s.fechaFinTransporte) < day(s.fechaIniTransporte)) throw bad('SUSTITUTIVA_FECHAS', 'fechaFinTransporte no puede ser anterior a fechaIniTransporte');
    if (day(s.fechaIniTransporte) < day(input.fechaEmision)) throw bad('SUSTITUTIVA_FECHA_INICIO', 'fechaIniTransporte no puede ser anterior a la fecha de emisión (SRI error 82)');
    if (s.tipoIdentificacionTransportista === '07') throw bad('SUSTITUTIVA_ID', 'el transportista no puede ser consumidor final');
    for (const d of s.destinos) {
      requireText('destino.motivoTraslado', d.motivoTraslado, MAX.texto);
      if (d.codEstabDestino !== undefined && !/^\d{3}$/.test(d.codEstabDestino)) throw bad('SUSTITUTIVA_ESTAB', 'destino.codEstabDestino debe tener 3 dígitos');
    }
  }
  return { t, ajustes, exportCostos, importeTotal, reembolsoTotales };
}

/** Verifica coherencia aritmética y de formato que el SRI valida al recibir. Lanza `ValidationError`. */
export function validateFactura(input: FacturaInput): void {
  calcular(input);
}

export function buildFacturaXml(input: FacturaInput): FacturaXml {
  const version = versionOf(input);
  const { t, ajustes, importeTotal, reembolsoTotales } = calcular(input);
  const e = input.emisor;
  const ce = input.comercioExterior;
  const tributaria = infoTributaria(TipoComprobante.Factura, e, input);

  const infoFactura = el('infoFactura', [
    el('fechaEmision', fecha(input.fechaEmision)),
    opt('dirEstablecimiento', e.direccionEstablecimiento),
    opt('contribuyenteEspecial', e.contribuyenteEspecial),
    obligado(e),
    ce ? el('comercioExterior', 'EXPORTADOR') : undefined,
    ce ? el('incoTermFactura', ce.incoTermFactura) : undefined,
    ce ? el('lugarIncoTerm', ce.lugarIncoTerm) : undefined,
    ce ? el('paisOrigen', ce.paisOrigen) : undefined,
    ce ? el('puertoEmbarque', ce.puertoEmbarque) : undefined,
    ce ? el('puertoDestino', ce.puertoDestino) : undefined,
    opt('paisDestino', ce?.paisDestino),
    opt('paisAdquisicion', ce?.paisAdquisicion),
    el('tipoIdentificacionComprador', input.comprador.tipoIdentificacion),
    opt('guiaRemision', input.guiaRemision),
    el('razonSocialComprador', input.comprador.razonSocial),
    el('identificacionComprador', input.comprador.identificacion),
    opt('direccionComprador', input.comprador.direccion),
    el('totalSinImpuestos', money(centsToString(t.sinImpuestos))),
    t.haySubsidio ? el('totalSubsidio', money(centsToString(t.subsidio))) : undefined,
    ce ? el('incoTermTotalSinImpuestos', ce.incoTermTotalSinImpuestos) : undefined,
    el('totalDescuento', money(centsToString(t.descuento))),
    ...(reembolsoTotales ? reembolsoCabeceraXml(reembolsoTotales) : []),
    totalConImpuestosXml(t.grupos, ajustes),
    compensacionesXml(input.compensaciones),
    el('propina', formatDecimal(input.propina ?? '0', 2)),
    ce?.fleteInternacional !== undefined ? el('fleteInternacional', money(ce.fleteInternacional)) : undefined,
    ce?.seguroInternacional !== undefined ? el('seguroInternacional', money(ce.seguroInternacional)) : undefined,
    ce?.gastosAduaneros !== undefined ? el('gastosAduaneros', money(ce.gastosAduaneros)) : undefined,
    ce?.gastosTransporteOtros !== undefined ? el('gastosTransporteOtros', money(ce.gastosTransporteOtros)) : undefined,
    el('importeTotal', money(centsToString(importeTotal))),
    el('moneda', input.moneda ?? 'DOLAR'),
    opt('placa', input.placa),
    pagosXml(input.pagos),
    input.valorRetIva === undefined ? undefined : el('valorRetIva', money(input.valorRetIva)),
    input.valorRetRenta === undefined ? undefined : el('valorRetRenta', money(input.valorRetRenta)),
  ]);

  const retenciones = input.retenciones?.length
    ? el('retenciones', input.retenciones.map((r) => el('retencion', [el('codigo', r.codigo), el('codigoPorcentaje', r.codigoPorcentaje), el('tarifa', money(r.tarifa)), el('valor', money(r.valor))])))
    : undefined;

  const s = input.infoSustitutivaGuiaRemision;
  const sustitutiva = s
    ? el('infoSustitutivaGuiaRemision', [
        el('dirPartida', s.dirPartida),
        el('dirDestinatario', s.dirDestinatario),
        el('fechaIniTransporte', fecha(s.fechaIniTransporte)),
        el('fechaFinTransporte', fecha(s.fechaFinTransporte)),
        el('razonSocialTransportista', s.razonSocialTransportista),
        el('tipoIdentificacionTransportista', s.tipoIdentificacionTransportista),
        el('rucTransportista', s.rucTransportista),
        el('placa', s.placa),
        el('destinos', s.destinos.map((d) => el('destino', [el('motivoTraslado', d.motivoTraslado), opt('docAduaneroUnico', d.docAduaneroUnico), opt('codEstabDestino', d.codEstabDestino), opt('ruta', d.ruta)]))),
      ])
    : undefined;

  const rubros = input.otrosRubrosTerceros?.length
    ? el('otrosRubrosTerceros', input.otrosRubrosTerceros.map((r) => el('rubro', [el('concepto', r.concepto), el('total', money(r.total))])))
    : undefined;

  const xml = document('factura', version, [
    tributaria.xml,
    infoFactura,
    detallesVentaXml(input.detalles, version === '2.0.0' ? 2 : 6),
    input.reembolsos ? reembolsosXml(input.reembolsos, 'factura') : undefined,
    retenciones,
    sustitutiva,
    rubros,
    tipoNegociableXml(input.tipoNegociable),
    maquinaFiscalXml(input.maquinaFiscal),
    infoAdicionalXml(input.infoAdicional),
  ]);
  return { claveAcceso: tributaria.claveAcceso, xml };
}
