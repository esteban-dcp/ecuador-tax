import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestP12, facturaBase, guiaRemisionBase, liquidacionBase, notaCreditoBase, notaDebitoBase, retencionBase } from '@ecuador-tax/testing';
import { loadCredentialsFromP12, signXml } from '@ecuador-tax/signature';
import {
  buildFacturaXml,
  buildGuiaRemisionXml,
  buildLiquidacionCompraXml,
  buildNotaCreditoXml,
  buildNotaDebitoXml,
  buildRetencionXml,
  validateAgainstXsd,
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

const cases = [
  ['factura', () => buildFacturaXml(facturaBase), 'factura_V1.1.0.xsd'],
  ['liquidación de compra', () => buildLiquidacionCompraXml(liquidacionBase), 'LiquidacionCompra_V1.1.0.xsd'],
  ['nota de crédito', () => buildNotaCreditoXml(notaCreditoBase), 'NotaCredito_V1.1.0.xsd'],
  ['nota de débito', () => buildNotaDebitoXml(notaDebitoBase), 'NotaDebito_V1.0.0.xsd'],
  ['comprobante de retención', () => buildRetencionXml(retencionBase), 'ComprobanteRetencion_V2.0.0.xsd'],
  ['guía de remisión', () => buildGuiaRemisionXml(guiaRemisionBase), 'GuiaRemision_V1.1.0.xsd'],
] as const;

describe.skipIf(!hasXmllint)('XML válido contra los XSD oficiales del SRI', () => {
  const t = createTestP12();
  const creds = loadCredentialsFromP12(t.p12, t.password);
  for (const [name, build, schema] of cases) {
    it(`${name} (${schema})`, async () => {
      const { xml } = build();
      expect(await validateAgainstXsd(xml, xsd(schema))).toEqual([]);
    });
    it(`${name} firmado sigue siendo válido`, async () => {
      expect(await validateAgainstXsd(signXml(build().xml, creds), xsd(schema))).toEqual([]);
    });
  }
  it('detecta un XML inválido', async () => {
    const bad = buildFacturaXml(facturaBase).xml.replace('<ambiente>1</ambiente>', '<ambiente>9</ambiente>');
    const issues = await validateAgainstXsd(bad, xsd('factura_V1.1.0.xsd'));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/ambiente/);
  });
});
