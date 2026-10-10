import { describe, expect, it } from 'vitest';
import { parseAccessKey } from '@ecuador-tax/access-key';
import { facturaBase } from '@ecuador-tax/testing';
import { buildFacturaXml, escapeXml } from '@ecuador-tax/xml';


describe('buildFacturaXml', () => {
  const r = buildFacturaXml(facturaBase);
  it('genera clave de acceso válida coherente con el XML', () => {
    const p = parseAccessKey(r.claveAcceso);
    expect(p.ok && p.value.tipoComprobante).toBe('01');
    expect(r.xml).toContain(`<claveAcceso>${r.claveAcceso}</claveAcceso>`);
    expect(r.xml).toContain('<codDoc>01</codDoc>');
  });
  it('es determinista', () => expect(buildFacturaXml(facturaBase).xml).toBe(r.xml));
  it('escapa caracteres especiales y conserva acentos', () => {
    expect(r.xml).toContain('PRUEBA &amp; CIA');
    expect(r.xml).toContain('&lt;Quito&gt;');
    expect(r.xml).toContain('Producto &quot;A&quot;');
    expect(r.xml).toContain('JUAN PÉREZ');
  });
  it('formatea importes y calcula totales', () => {
    expect(r.xml).toContain('<totalSinImpuestos>20.00</totalSinImpuestos>');
    expect(r.xml).toContain('<importeTotal>23.00</importeTotal>');
    expect(r.xml).toContain('<cantidad>2.00</cantidad>');
    expect(r.xml).toContain('<campoAdicional nombre="Email">a@b.ec</campoAdicional>');
    expect(r.xml).toContain('<factura id="comprobante" version="1.1.0">');
  });
  it('orden de infoTributaria según ficha técnica', () => {
    const order = ['ambiente', 'tipoEmision', 'razonSocial', 'nombreComercial', 'ruc', 'claveAcceso', 'codDoc', 'estab', 'ptoEmi', 'secuencial', 'dirMatriz'];
    const idx = order.map((t) => r.xml.indexOf(`<${t}>`));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it('rechaza pagos que no suman el total', () => {
    expect(() => buildFacturaXml({ ...facturaBase, pagos: [{ formaPago: '01', total: '22.99' }] })).toThrow(/pagos/);
  });
  it('rechaza facturas sin detalles', () => {
    expect(() => buildFacturaXml({ ...facturaBase, detalles: [] })).toThrow(/detalle/);
  });
  it('rechaza caracteres de control', () => {
    expect(() => escapeXml('a\u0001b')).toThrow(RangeError);
  });
});

describe('validaciones adicionales', () => {
  const line = facturaBase.detalles[0]!;
  it('rechaza negativos e incoherencias de línea', () => {
    expect(() => buildFacturaXml({ ...facturaBase, detalles: [{ ...line, descuento: '-0.50' }] })).toThrow(/no negativo/);
    expect(() => buildFacturaXml({ ...facturaBase, detalles: [{ ...line, cantidad: '5' }] })).toThrow(/cantidad/);
  });
  it('acepta ICE + IVA (base IVA incluye ICE)', () => {
    const r = buildFacturaXml({
      ...facturaBase,
      detalles: [{ ...line, impuestos: [
        { codigo: '3', codigoPorcentaje: '3011', tarifa: '10', baseImponible: '20', valor: '2' },
        { codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '22', valor: '3.30' },
      ] }],
      pagos: [{ formaPago: '01', total: '25.30' }],
    });
    expect(r.xml).toContain('<importeTotal>25.30</importeTotal>');
  });
  it('rechaza surrogates sueltos', () => expect(() => escapeXml('a\uD800b')).toThrow(RangeError));
});
