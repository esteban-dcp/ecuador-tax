import { TipoComprobante, type Ambiente } from '@ecuador-tax/core';
import { el, opt } from './xml-writer.js';
import { maquinaFiscalXml, reembolsosXml, validateReembolsos, type MaquinaFiscal, type Reembolso } from './extras.js';
import { CATALOGOS_POR_DEFECTO, RETENCION_CAJAS_BANANO, RETENCION_IVA_CODIGOS, RETENCION_ISD_CODIGOS, type Catalogos } from './tables.js';
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
  type DocumentXml,
  type Emisor,
  type Pago,
  type TipoIdentificacion,
} from './common.js';

/** Comprobante de retención ATS (Anexo 10, versión 2.0.0). */
export const RETENCION_VERSION = '2.0.0';

export interface ImpuestoDocSustento {
  /** 2 IVA, 3 ICE, 5 IRBPNR. */
  readonly codImpuesto: string;
  readonly codigoPorcentaje: string;
  readonly baseImponible: string;
  readonly tarifa: string;
  readonly valorImpuesto: string;
}

export interface Dividendos {
  readonly fechaPagoDiv: Date;
  readonly imRentaSoc: string;
  /** Ejercicio fiscal de las utilidades, p. ej. 2025. */
  readonly ejerFisUtDiv: string;
}

export interface CompraCajasBanano {
  readonly numCajBan: string;
  readonly precCajBan: string;
}

export interface RetencionLinea {
  /** 1 renta, 2 IVA, 6 ISD. */
  readonly codigo: '1' | '2' | '6';
  /** Código de retención: IVA y ISD según la tabla 20; renta según el catálogo ATS vigente. */
  readonly codigoRetencion: string;
  readonly baseImponible: string;
  readonly porcentajeRetener: string;
  readonly valorRetenido: string;
  /** Obligatorio cuando `codSustento` es "10" (dividendos). */
  readonly dividendos?: Dividendos;
  /** Obligatorio con los códigos de retención 338, 340, 341, 342, 342A y 342B. */
  readonly compraCajBanano?: CompraCajasBanano;
}

export interface DocSustento {
  /** Código de sustento tributario (tabla 5 de la ficha). */
  readonly codSustento: string;
  /** Tipo de comprobante de sustento, p. ej. "01". */
  readonly codDocSustento: string;
  /** 15 dígitos sin guiones: estab + ptoEmi + secuencial. */
  readonly numDocSustento: string;
  readonly fechaEmision: Date;
  readonly fechaRegistroContable?: Date;
  readonly numAutDocSustento?: string;
  /** "01" local, "02" exterior. */
  readonly pagoLocExt: '01' | '02';
  /** Con `pagoLocExt` "02": tipo de régimen ("01" régimen fiscal preferente, "02" paraíso fiscal, "03" otro; catálogo ATS). */
  readonly tipoRegi?: string;
  /** Con `pagoLocExt` "02": país del pago (tabla 25 si tipoRegi = "01"; catálogo ATS en otro caso). */
  readonly paisEfecPago?: string;
  readonly aplicConvDobTrib?: 'SI' | 'NO';
  /** Obligatorio si `aplicConvDobTrib` es "NO". */
  readonly pagExtSujRetNorLeg?: 'SI' | 'NO';
  readonly pagoRegFis?: 'SI' | 'NO';
  /** Obligatorio cuando `codDocSustento` es "41". */
  readonly reembolsos?: readonly Reembolso[];
  readonly totalSinImpuestos: string;
  readonly importeTotal: string;
  readonly impuestos: readonly ImpuestoDocSustento[];
  readonly retenciones: readonly RetencionLinea[];
  readonly pagos: readonly Pago[];
}

export interface RetencionInput {
  readonly ambiente: Ambiente;
  readonly fechaEmision: Date;
  readonly secuencial: string;
  readonly codigoNumerico?: string;
  readonly emisor: Emisor;
  readonly sujetoRetenido: {
    readonly tipoIdentificacion: TipoIdentificacion;
    readonly identificacion: string;
    readonly razonSocial: string;
    /** "01" persona natural, "02" sociedad. Opcional. */
    readonly tipoSujeto?: '01' | '02';
    readonly parteRelacionada: boolean;
  };
  /** `mm/aaaa`. */
  readonly periodoFiscal: string;
  readonly docsSustento: readonly DocSustento[];
  readonly infoAdicional?: Readonly<Record<string, string>>;
  readonly maquinaFiscal?: MaquinaFiscal;
  readonly catalogos?: Partial<Catalogos>;
}

/** valorRetenido ≈ base × porcentaje / 100 (tolerancia 1 centavo). */
function retencionOk(r: RetencionLinea): boolean {
  const pct = cents(r.porcentajeRetener); // centésimas de %
  const expected = (cents(r.baseImponible) * pct + 5_000n) / 10_000n;
  const diff = expected - cents(r.valorRetenido);
  return diff >= -1n && diff <= 1n;
}

const PCT_RETENCION_IVA: Readonly<Record<string, string>> = { '9': '10', '10': '20', '1': '30', '11': '50', '2': '70', '3': '100', '5': '100', '6': '100', '7': '0', '8': '0' };

function validateRetencionLinea(at: string, r: RetencionLinea, codSustento: string): void {
  if (r.codigo === '2') {
    if (!RETENCION_IVA_CODIGOS.has(r.codigoRetencion)) throw bad('RET_IVA_CODE', `${at}: codigoRetencion de IVA desconocido: ${r.codigoRetencion} (tabla 20)`);
    if (cents(r.porcentajeRetener) !== cents(PCT_RETENCION_IVA[r.codigoRetencion] as string)) {
      throw bad('RET_IVA_PCT', `${at}: porcentajeRetener no corresponde al código ${r.codigoRetencion} (${PCT_RETENCION_IVA[r.codigoRetencion]} %)`);
    }
  }
  if (r.codigo === '6' && !RETENCION_ISD_CODIGOS.has(r.codigoRetencion)) throw bad('RET_ISD_CODE', `${at}: codigoRetencion de ISD desconocido: ${r.codigoRetencion} (tabla 20)`);
  const banano = RETENCION_CAJAS_BANANO.has(r.codigoRetencion);
  if (banano !== (r.compraCajBanano !== undefined)) {
    throw bad('RET_BANANO', `${at}: compraCajBanano ${banano ? 'es obligatorio' : 'no corresponde'} con el código de retención ${r.codigoRetencion}`);
  }
  if (r.compraCajBanano) {
    if (!/^\d{1,7}$/.test(r.compraCajBanano.numCajBan)) throw bad('RET_BANANO_NUM', `${at}: numCajBan debe tener de 1 a 7 dígitos`);
    nonNegative(`${at}.precCajBan`, r.compraCajBanano.precCajBan);
  }
  if ((codSustento === '10') !== (r.dividendos !== undefined)) {
    throw bad('RET_DIVIDENDOS', `${at}: dividendos ${codSustento === '10' ? 'es obligatorio con codSustento 10' : 'solo corresponde con codSustento 10'}`);
  }
  if (r.dividendos) {
    nonNegative(`${at}.imRentaSoc`, r.dividendos.imRentaSoc);
    if (!/^(19|20)\d{2}$/.test(r.dividendos.ejerFisUtDiv)) throw bad('RET_DIVIDENDOS_EJER', `${at}: ejerFisUtDiv debe ser un año de 4 dígitos`);
  }
}

function validateDocSustento(at: string, d: DocSustento, cat: Catalogos): void {
  if (d.numAutDocSustento !== undefined && !/^(\d{10}|\d{37}|\d{49})$/.test(d.numAutDocSustento)) throw bad('RET_AUT', `${at}.numAutDocSustento debe tener 10, 37 o 49 dígitos`);
  const exterior = d.pagoLocExt === '02';
  const campos = [d.tipoRegi, d.paisEfecPago, d.aplicConvDobTrib, d.pagExtSujRetNorLeg, d.pagoRegFis];
  if (!exterior) {
    if (campos.some((c) => c !== undefined)) throw bad('RET_LOCAL_EXT_FIELDS', `${at}: los campos de pago al exterior solo aplican con pagoLocExt "02"`);
  } else {
    if (d.tipoRegi === undefined || !/^\d{2}$/.test(d.tipoRegi)) throw bad('RET_TIPO_REGI', `${at}: tipoRegi es obligatorio con pagoLocExt "02"`);
    if (d.paisEfecPago === undefined || !/^\d{3,4}$/.test(d.paisEfecPago)) throw bad('RET_PAIS', `${at}: paisEfecPago es obligatorio con pagoLocExt "02" (3 o 4 dígitos)`);
    if (d.tipoRegi === '01' && !(d.paisEfecPago in cat.paises)) throw bad('RET_PAIS', `${at}: paisEfecPago debe estar en la tabla 25 cuando tipoRegi es "01"`);
    if (d.tipoRegi === '03' && d.paisEfecPago === '593') throw bad('RET_PAIS', `${at}: paisEfecPago no puede ser 593 cuando tipoRegi es "03"`);
    if (d.aplicConvDobTrib === undefined) throw bad('RET_CONV_DOBLE', `${at}: aplicConvDobTrib es obligatorio con pagoLocExt "02"`);
    if (d.aplicConvDobTrib === 'NO' && d.pagExtSujRetNorLeg === undefined) throw bad('RET_NOR_LEG', `${at}: pagExtSujRetNorLeg es obligatorio cuando aplicConvDobTrib es "NO"`);
    if (d.pagoRegFis === undefined) throw bad('RET_REG_FIS', `${at}: pagoRegFis es obligatorio con pagoLocExt "02"`);
  }
  if ((d.codDocSustento === '41') !== (d.reembolsos !== undefined)) {
    throw bad('RET_REEMBOLSOS', `${at}: reembolsos ${d.codDocSustento === '41' ? 'es obligatorio con codDocSustento 41' : 'solo corresponde con codDocSustento 41'}`);
  }
  if (d.reembolsos) validateReembolsos(d.reembolsos, cat.paises);
}

function reembolsoTotalesXml(list: readonly Reembolso[], cat: Catalogos): string[] {
  const t = validateReembolsos(list, cat.paises);
  return [
    el('totalComprobantesReembolso', money(centsToString(t.base + t.impuesto))),
    el('totalBaseImponibleReembolso', money(centsToString(t.base))),
    el('totalImpuestoReembolso', money(centsToString(t.impuesto))),
  ];
}

export function buildRetencionXml(input: RetencionInput): DocumentXml {
  const cat: Catalogos = { ...CATALOGOS_POR_DEFECTO, ...(input.catalogos as Partial<Catalogos> | undefined) };
  validateEmisor(input.emisor);
  if (!/^\d{9}$/.test(input.secuencial)) throw bad('SEQ_FORMAT', 'secuencial debe tener 9 dígitos');
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(input.periodoFiscal)) throw bad('RET_PERIODO', 'periodoFiscal debe tener formato mm/aaaa');
  requireText('sujetoRetenido.razonSocial', input.sujetoRetenido.razonSocial, MAX.texto);
  requireText('sujetoRetenido.identificacion', input.sujetoRetenido.identificacion, 20);
  validateIdentificacion('sujetoRetenido', input.sujetoRetenido.tipoIdentificacion, input.sujetoRetenido.identificacion, false);
  if (input.sujetoRetenido.tipoIdentificacion === '08' && input.sujetoRetenido.tipoSujeto === undefined) {
    throw bad('RET_TIPO_SUJETO', 'tipoSujeto es obligatorio cuando la identificación es del exterior (08)');
  }
  if (input.docsSustento.length === 0) throw bad('RET_NO_DOCS', 'se requiere al menos un documento de sustento');
  for (const [i, d] of input.docsSustento.entries()) {
    const at = `docsSustento[${i}]`;
    if (!/^\d{15}$/.test(d.numDocSustento)) throw bad('RET_NUM_DOC', `${at}.numDocSustento debe tener 15 dígitos`);
    if (d.impuestos.length === 0) throw bad('RET_NO_TAXES', `${at} requiere impuestos del documento`);
    if (d.retenciones.length === 0) throw bad('RET_NO_RETENTIONS', `${at} requiere al menos una retención`);
    if (d.pagos.length === 0) throw bad('RET_NO_PAYMENTS', `${at} requiere al menos un pago`);
    nonNegative(`${at}.totalSinImpuestos`, d.totalSinImpuestos);
    nonNegative(`${at}.importeTotal`, d.importeTotal);
    for (const pg of d.pagos) nonNegative(`${at}.pago.total`, pg.total);
    validateDocSustento(at, d, cat);
    for (const r of d.retenciones) {
      for (const [k, v] of [['baseImponible', r.baseImponible], ['porcentajeRetener', r.porcentajeRetener], ['valorRetenido', r.valorRetenido]] as const) nonNegative(`${at}.retencion.${k}`, v);
      validateRetencionLinea(at, r, d.codSustento);
      if (!retencionOk(r)) throw bad('RET_VALUE', `${at}: valorRetenido no coincide con baseImponible × porcentajeRetener`);
    }
  }

  const e = input.emisor;
  const tributaria = infoTributaria(TipoComprobante.ComprobanteRetencion, e, input);
  const s = input.sujetoRetenido;
  const info = el('infoCompRetencion', [
    el('fechaEmision', fecha(input.fechaEmision)),
    opt('dirEstablecimiento', e.direccionEstablecimiento),
    opt('contribuyenteEspecial', e.contribuyenteEspecial),
    obligado(e),
    el('tipoIdentificacionSujetoRetenido', s.tipoIdentificacion),
    opt('tipoSujetoRetenido', s.tipoSujeto),
    el('parteRel', s.parteRelacionada ? 'SI' : 'NO'),
    el('razonSocialSujetoRetenido', s.razonSocial),
    el('identificacionSujetoRetenido', s.identificacion),
    el('periodoFiscal', input.periodoFiscal),
  ]);
  const docs = el(
    'docsSustento',
    input.docsSustento.map((d) =>
      el('docSustento', [
        el('codSustento', d.codSustento),
        el('codDocSustento', d.codDocSustento),
        el('numDocSustento', d.numDocSustento),
        el('fechaEmisionDocSustento', fecha(d.fechaEmision)),
        d.fechaRegistroContable ? el('fechaRegistroContable', fecha(d.fechaRegistroContable)) : undefined,
        opt('numAutDocSustento', d.numAutDocSustento),
        el('pagoLocExt', d.pagoLocExt),
        opt('tipoRegi', d.tipoRegi),
        opt('paisEfecPago', d.paisEfecPago),
        opt('aplicConvDobTrib', d.aplicConvDobTrib),
        opt('pagExtSujRetNorLeg', d.pagExtSujRetNorLeg),
        opt('pagoRegFis', d.pagoRegFis),
        ...(d.reembolsos ? reembolsoTotalesXml(d.reembolsos, cat) : []),
        el('totalSinImpuestos', money(d.totalSinImpuestos)),
        el('importeTotal', money(d.importeTotal)),
        el(
          'impuestosDocSustento',
          d.impuestos.map((t) =>
            el('impuestoDocSustento', [
              el('codImpuestoDocSustento', t.codImpuesto),
              el('codigoPorcentaje', t.codigoPorcentaje),
              el('baseImponible', money(t.baseImponible)),
              el('tarifa', money(t.tarifa)),
              el('valorImpuesto', money(t.valorImpuesto)),
            ]),
          ),
        ),
        el(
          'retenciones',
          d.retenciones.map((r) =>
            el('retencion', [
              el('codigo', r.codigo),
              el('codigoRetencion', r.codigoRetencion),
              el('baseImponible', money(r.baseImponible)),
              el('porcentajeRetener', money(r.porcentajeRetener)),
              el('valorRetenido', money(r.valorRetenido)),
              r.dividendos
                ? el('dividendos', [el('fechaPagoDiv', fecha(r.dividendos.fechaPagoDiv)), el('imRentaSoc', money(r.dividendos.imRentaSoc)), el('ejerFisUtDiv', r.dividendos.ejerFisUtDiv)])
                : undefined,
              r.compraCajBanano ? el('compraCajBanano', [el('numCajBan', r.compraCajBanano.numCajBan), el('precCajBan', money(r.compraCajBanano.precCajBan))]) : undefined,
            ]),
          ),
        ),
        d.reembolsos ? reembolsosXml(d.reembolsos, 'retencion') : undefined,
        pagosXml(d.pagos),
      ]),
    ),
  );
  return { claveAcceso: tributaria.claveAcceso, xml: document('comprobanteRetencion', RETENCION_VERSION, [tributaria.xml, info, docs, maquinaFiscalXml(input.maquinaFiscal), infoAdicionalXml(input.infoAdicional)]) };
}
