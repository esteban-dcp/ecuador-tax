import { el, opt } from './xml-writer.js';
import { PAISES } from './tables.js';
import {
  bad,
  cents,
  centsToString,
  fecha,
  money,
  nonNegative,
  requireText,
  type TaxGroup,
  type TipoIdentificacion,
} from './common.js';

/** Datos de la máquina fiscal (Anexo 13). Aplica a factura, nota de crédito/débito, guía y retención. */
export interface MaquinaFiscal {
  readonly marca: string;
  readonly modelo: string;
  readonly serie: string;
}

export function maquinaFiscalXml(m: MaquinaFiscal | undefined): string | undefined {
  if (!m) return undefined;
  for (const k of ['marca', 'modelo', 'serie'] as const) requireText(`maquinaFiscal.${k}`, m[k], 30);
  return el('maquinaFiscal', [el('marca', m.marca), el('modelo', m.modelo), el('serie', m.serie)]);
}

/** Factura comercial negociable (Anexo 11): correo del receptor para la notificación masiva. */
export interface TipoNegociable {
  readonly correo: string;
}

export function tipoNegociableXml(t: TipoNegociable | undefined): string | undefined {
  if (!t) return undefined;
  requireText('tipoNegociable.correo', t.correo, 100);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.correo)) throw bad('NEGOCIABLE_EMAIL', 'tipoNegociable.correo no es un correo válido');
  return el('tipoNegociable', [el('correo', t.correo)]);
}

/** Compensación (solidaria): el código siempre es "1". El SDK no la incluye en ningún total. */
export interface Compensacion {
  readonly codigo: '1';
  readonly tarifa: string;
  readonly valor: string;
}

export function compensacionesXml(list: readonly Compensacion[] | undefined, wrapper = 'compensaciones', item = 'compensacion'): string | undefined {
  if (!list || list.length === 0) return undefined;
  return el(
    wrapper,
    list.map((c) => {
      if (c.codigo !== '1') throw bad('COMPENSACION_CODE', 'compensación: el código debe ser "1"');
      nonNegative('compensacion.tarifa', c.tarifa);
      nonNegative('compensacion.valor', c.valor);
      return el(item, [el('codigo', c.codigo), el('tarifa', money(c.tarifa)), el('valor', money(c.valor))]);
    }),
  );
}

/**
 * Ajustes por grupo de impuesto (`codigo`+`codigoPorcentaje`): descuento adicional y devolución automática del IVA
 * (Anexo 20). `valorDevolucionIva` se resta del total del comprobante y requiere comprador con cédula (05).
 */
export interface AjusteImpuesto {
  readonly codigo: string;
  readonly codigoPorcentaje: string;
  readonly descuentoAdicional?: string;
  readonly valorDevolucionIva?: string;
}

export interface Ajustes {
  readonly porGrupo: ReadonlyMap<string, AjusteImpuesto>;
  /** Suma de `valorDevolucionIva` en centavos. */
  readonly devolucionIva: bigint;
}

export function resolverAjustes(
  ajustes: readonly AjusteImpuesto[] | undefined,
  grupos: readonly TaxGroup[],
  comprador: TipoIdentificacion,
  allowDescuentoAdicional = true,
): Ajustes {
  const porGrupo = new Map<string, AjusteImpuesto>();
  let devolucionIva = 0n;
  for (const a of ajustes ?? []) {
    const k = `${a.codigo}|${a.codigoPorcentaje}`;
    const g = grupos.find((x) => x.codigo === a.codigo && x.codigoPorcentaje === a.codigoPorcentaje);
    if (!g) throw bad('AJUSTE_GRUPO', `ajuste para un impuesto inexistente en el comprobante: ${k}`);
    if (porGrupo.has(k)) throw bad('AJUSTE_DUP', `ajuste repetido para ${k}`);
    if (a.descuentoAdicional !== undefined) {
      if (a.codigo !== '2') throw bad('AJUSTE_DESCUENTO', 'descuentoAdicional solo aplica al IVA (código 2, ficha Anexo 4)');
      if (!allowDescuentoAdicional) throw bad('AJUSTE_DESCUENTO', 'descuentoAdicional no existe en este comprobante');
      nonNegative('ajuste.descuentoAdicional', a.descuentoAdicional);
    }
    if (a.valorDevolucionIva !== undefined) {
      nonNegative('ajuste.valorDevolucionIva', a.valorDevolucionIva);
      if (a.codigo !== '2') throw bad('AJUSTE_DIG', 'valorDevolucionIva solo aplica al IVA (código 2)');
      const v = cents(a.valorDevolucionIva);
      if (v > g.valor) throw bad('AJUSTE_DIG_MAX', 'valorDevolucionIva no puede superar el valor del impuesto (Anexo 20)');
      if (v > 0n && comprador !== '05') throw bad('AJUSTE_DIG_ID', 'la devolución del IVA exige comprador con cédula (tipo 05, Anexo 20)');
      devolucionIva += v;
    }
    porGrupo.set(k, a);
  }
  return { porGrupo, devolucionIva };
}

export const totalConImpuestosXml = (grupos: readonly TaxGroup[], ajustes?: Ajustes, opts: { tarifa?: boolean; descuentoAdicional?: boolean } = {}): string =>
  el(
    'totalConImpuestos',
    grupos.map((g) => {
      const a = ajustes?.porGrupo.get(`${g.codigo}|${g.codigoPorcentaje}`);
      return el('totalImpuesto', [
        el('codigo', g.codigo),
        el('codigoPorcentaje', g.codigoPorcentaje),
        opts.descuentoAdicional !== false && a?.descuentoAdicional !== undefined ? el('descuentoAdicional', money(a.descuentoAdicional)) : undefined,
        el('baseImponible', money(centsToString(g.base))),
        opts.tarifa === false ? undefined : el('tarifa', money(g.tarifa)),
        el('valor', money(centsToString(g.valor))),
        a?.valorDevolucionIva !== undefined ? el('valorDevolucionIva', money(a.valorDevolucionIva)) : undefined,
      ]);
    }),
  );

// ---------------------------------------------------------------------------------------------
// Reembolsos (Anexos 5 y 10)

export interface ReembolsoImpuesto {
  readonly codigo: string;
  readonly codigoPorcentaje: string;
  readonly tarifa: string;
  readonly baseImponibleReembolso: string;
  readonly impuestoReembolso: string;
}

export interface Reembolso {
  readonly tipoIdentificacionProveedor: TipoIdentificacion;
  readonly identificacionProveedor: string;
  /** Código de país (tabla 25), p. ej. "593". Obligatorio según la ficha. */
  readonly codPaisPagoProveedor: string;
  /** Tabla 26: "01" persona natural, "02" sociedad. */
  readonly tipoProveedor: '01' | '02';
  /** Tipo de comprobante del reembolso, p. ej. "01". */
  readonly codDoc: string;
  readonly establecimiento: string;
  readonly puntoEmision: string;
  readonly secuencial: string;
  readonly fechaEmision: Date;
  /** 10, 37 o 49 dígitos. */
  readonly numeroAutorizacion: string;
  readonly impuestos: readonly ReembolsoImpuesto[];
  /** Solo en factura y liquidación (no en retención). */
  readonly compensaciones?: readonly Compensacion[];
}

export interface ReembolsoTotales {
  readonly base: bigint;
  readonly impuesto: bigint;
}

export function validateReembolsos(list: readonly Reembolso[], paises: Readonly<Record<string, string>> = PAISES): ReembolsoTotales {
  if (list.length === 0) throw bad('REEMBOLSO_EMPTY', 'reembolsos requiere al menos un detalle');
  let base = 0n;
  let impuesto = 0n;
  for (const [i, r] of list.entries()) {
    const at = `reembolsos[${i}]`;
    requireText(`${at}.identificacionProveedor`, r.identificacionProveedor, 20);
    if (r.tipoIdentificacionProveedor === '07') throw bad('REEMBOLSO_ID', `${at}: el proveedor no puede ser consumidor final`);
    if (!(r.codPaisPagoProveedor in paises)) throw bad('REEMBOLSO_PAIS', `${at}: código de país desconocido: ${r.codPaisPagoProveedor}`);
    if (!/^\d{2,3}$/.test(r.codDoc)) throw bad('REEMBOLSO_DOC', `${at}.codDoc debe tener 2 o 3 dígitos`);
    if (!/^\d{3}$/.test(r.establecimiento) || !/^\d{3}$/.test(r.puntoEmision) || !/^\d{9}$/.test(r.secuencial)) {
      throw bad('REEMBOLSO_NUM', `${at}: establecimiento/puntoEmision de 3 dígitos y secuencial de 9`);
    }
    if (!/^(\d{10}|\d{37}|\d{49})$/.test(r.numeroAutorizacion)) throw bad('REEMBOLSO_AUT', `${at}.numeroAutorizacion debe tener 10, 37 o 49 dígitos`);
    if (r.impuestos.length === 0) throw bad('REEMBOLSO_TAXES', `${at} requiere detalleImpuestos`);
    for (const t of r.impuestos) {
      for (const [k, v] of [['tarifa', t.tarifa], ['baseImponibleReembolso', t.baseImponibleReembolso], ['impuestoReembolso', t.impuestoReembolso]] as const) nonNegative(`${at}.${k}`, v);
      base += cents(t.baseImponibleReembolso);
      impuesto += cents(t.impuestoReembolso);
    }
  }
  return { base, impuesto };
}

/** En la retención la tarifa del reembolso es un entero de 1 a 4 dígitos (XSD). */
function integerTarifa(v: string): string {
  const m = /^(\d{1,4})(\.0+)?$/.exec(v.trim());
  if (!m) throw bad('REEMBOLSO_TARIFA', `reembolso en retención: la tarifa debe ser un entero (recibido "${v}")`);
  return m[1] as string;
}

export function reembolsosXml(list: readonly Reembolso[], variant: 'factura' | 'liquidacion' | 'retencion'): string {
  const retencion = variant === 'retencion';
  for (const r of list) {
    if (r.compensaciones && variant !== 'factura') throw bad('REEMBOLSO_COMPENSACIONES', 'compensaciones de reembolso solo existen en la factura');
  }
  return el(
    'reembolsos',
    list.map((r) =>
      el('reembolsoDetalle', [
        el('tipoIdentificacionProveedorReembolso', r.tipoIdentificacionProveedor),
        el('identificacionProveedorReembolso', r.identificacionProveedor),
        opt('codPaisPagoProveedorReembolso', r.codPaisPagoProveedor),
        el('tipoProveedorReembolso', r.tipoProveedor),
        el('codDocReembolso', r.codDoc),
        el('estabDocReembolso', r.establecimiento),
        el('ptoEmiDocReembolso', r.puntoEmision),
        el('secuencialDocReembolso', r.secuencial),
        el('fechaEmisionDocReembolso', fecha(r.fechaEmision)),
        el(retencion ? 'numeroAutorizacionDocReemb' : 'numeroautorizacionDocReemb', r.numeroAutorizacion),
        el(
          'detalleImpuestos',
          r.impuestos.map((t) =>
            el('detalleImpuesto', [
              el('codigo', t.codigo),
              el('codigoPorcentaje', t.codigoPorcentaje),
              el('tarifa', retencion ? integerTarifa(t.tarifa) : money(t.tarifa)),
              el('baseImponibleReembolso', money(t.baseImponibleReembolso)),
              el('impuestoReembolso', money(t.impuestoReembolso)),
            ]),
          ),
        ),
        retencion ? undefined : compensacionesXml(r.compensaciones, 'compensacionesReembolso', 'compensacionReembolso'),
      ]),
    ),
  );
}

/** Encabezado de reembolso en el cuerpo de factura/liquidación (codDocReembolso = 41 y sumas). */
export function reembolsoCabeceraXml(t: ReembolsoTotales): string[] {
  return [
    el('codDocReembolso', '41'),
    el('totalComprobantesReembolso', money(centsToString(t.base + t.impuesto))),
    el('totalBaseImponibleReembolso', money(centsToString(t.base))),
    el('totalImpuestoReembolso', money(centsToString(t.impuesto))),
  ];
}

