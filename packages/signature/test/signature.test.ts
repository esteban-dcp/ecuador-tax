import { beforeAll, describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import { createTestP12, facturaBase } from '@ecuador-tax/testing';
import { buildFacturaXml } from '@ecuador-tax/xml';
import { loadCredentialsFromP12, signXml, verifySignedXml } from '@ecuador-tax/signature';

let t: ReturnType<typeof createTestP12>;
beforeAll(() => {
  t = createTestP12({ password: 'pw-123' });
});

describe('loadCredentialsFromP12', () => {
  it('carga certificado y expone metadatos', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    expect(c.subjectCommonName).toBe('CERTIFICADO DE PRUEBA SDK');
    expect(c.issuerName).toBe('C=EC,O=ECUADOR TAX SDK TEST,CN=CERTIFICADO DE PRUEBA SDK');
    expect(c.serialNumber).toBe(BigInt('0x01a2b3c4d5e6f7').toString());
  });
  it('contraseña incorrecta no filtra información', () => {
    try {
      loadCredentialsFromP12(t.p12, 'mala');
      expect.unreachable();
    } catch (e) {
      expect((e as { code: string }).code).toBe('P12_UNREADABLE');
      expect(String(e)).not.toContain('mala');
    }
  });
  it('rechaza certificados caducados salvo allowExpired', () => {
    const old = createTestP12({ notBefore: new Date('2020-01-01'), notAfter: new Date('2021-01-01') });
    expect(() => loadCredentialsFromP12(old.p12, old.password)).toThrow(/caducado/);
    expect(loadCredentialsFromP12(old.p12, old.password, { allowExpired: true })).toBeTruthy();
  });
  it('no se serializa ni se inspecciona con la clave', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    expect(JSON.stringify(c)).toBe('"[SigningCredentials]"');
    expect(inspect(c)).toBe('[SigningCredentials]');
  });
});

describe('signXml', () => {
  const unsigned = buildFacturaXml(facturaBase).xml;
  it('produce una firma verificable', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const signed = signXml(unsigned, c);
    expect(signed).toContain('<ds:Signature');
    expect(signed.indexOf('</ds:Signature></factura>')).toBeGreaterThan(0);
    const v = verifySignedXml(signed);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });
  it('detecta manipulación del contenido', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const signed = signXml(unsigned, c).replace('<importeTotal>23.00', '<importeTotal>99.00');
    expect(verifySignedXml(signed).valid).toBe(false);
  });
  it('detecta manipulación de SignedProperties', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const signed = signXml(unsigned, c).replace('contenido comprobante', 'otra cosa');
    expect(verifySignedXml(signed).valid).toBe(false);
  });
  it('rechaza doble firma y raíz sin id', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    expect(() => signXml(signXml(unsigned, c), c)).toThrow(/ya contiene/);
    expect(() => signXml('<factura><a/></factura>', c)).toThrow(/id="comprobante"/);
    expect(() => signXml('<factura id="comprobante"><a></factura>', c)).toThrow(/bien formado/);
  });
  it('conserva caracteres no ASCII', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const signed = signXml(unsigned, c);
    expect(signed).toContain('JUAN PÉREZ');
    expect(verifySignedXml(signed).valid).toBe(true);
  });
});

describe('robustez', () => {
  const unsigned = buildFacturaXml(facturaBase).xml;
  it('rechaza raíz con namespaces en vez de firmar mal', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const x = unsigned.replace('<factura ', '<factura xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ');
    expect(() => signXml(x, c)).toThrow(/namespaces/);
  });
  it('rechaza signature wrapping', () => {
    const c = loadCredentialsFromP12(t.p12, t.password);
    const signed = signXml(unsigned, c).replace(/^<\?xml[^>]*\?>/, '');
    expect(verifySignedXml(`<factura id="otro">${signed}</factura>`).valid).toBe(false);
  });
  it('XML mal formado no lanza', () => {
    expect(verifySignedXml('<a><b></a>').valid).toBe(false);
  });
});
