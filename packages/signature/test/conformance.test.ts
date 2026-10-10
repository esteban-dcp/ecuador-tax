import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { createTestP12, facturaBase } from '@ecuador-tax/testing';
import { buildFacturaXml } from '@ecuador-tax/xml';
import { loadCredentialsFromP12, signXml } from '@ecuador-tax/signature';

/**
 * Esqueleto de la firma del ejemplo oficial de la ficha técnica v2.34, Anexo 14 (XAdES-BES).
 * Cada línea: profundidad, nombre del elemento, atributos en orden y valores fijos (los demás
 * valores —Ids numéricos, digests, certificado— son variables y se comparan por patrón).
 */
const SKELETON = `
0 ds:Signature xmlns:ds=http://www.w3.org/2000/09/xmldsig# xmlns:etsi=http://uri.etsi.org/01903/v1.3.2# Id=*
1 ds:SignedInfo Id=*
2 ds:CanonicalizationMethod Algorithm=http://www.w3.org/TR/2001/REC-xml-c14n-20010315
2 ds:SignatureMethod Algorithm=http://www.w3.org/2000/09/xmldsig#rsa-sha1
2 ds:Reference Id=* Type=http://uri.etsi.org/01903#SignedProperties URI=*
3 ds:DigestMethod Algorithm=http://www.w3.org/2000/09/xmldsig#sha1
3 ds:DigestValue
2 ds:Reference URI=*
3 ds:DigestMethod Algorithm=http://www.w3.org/2000/09/xmldsig#sha1
3 ds:DigestValue
2 ds:Reference Id=* URI=#comprobante
3 ds:Transforms
4 ds:Transform Algorithm=http://www.w3.org/2000/09/xmldsig#enveloped-signature
3 ds:DigestMethod Algorithm=http://www.w3.org/2000/09/xmldsig#sha1
3 ds:DigestValue
1 ds:SignatureValue Id=*
1 ds:KeyInfo Id=*
2 ds:X509Data
3 ds:X509Certificate
2 ds:KeyValue
3 ds:RSAKeyValue
4 ds:Modulus
4 ds:Exponent
1 ds:Object Id=*
2 etsi:QualifyingProperties Target=*
3 etsi:SignedProperties Id=*
4 etsi:SignedSignatureProperties
5 etsi:SigningTime
5 etsi:SigningCertificate
6 etsi:Cert
7 etsi:CertDigest
8 ds:DigestMethod Algorithm=http://www.w3.org/2000/09/xmldsig#sha1
8 ds:DigestValue
7 etsi:IssuerSerial
8 ds:X509IssuerName
8 ds:X509SerialNumber
4 etsi:SignedDataObjectProperties
5 etsi:DataObjectFormat ObjectReference=*
6 etsi:Description
6 etsi:MimeType
`.trim();

function skeletonOf(el: Element, depth = 0, out: string[] = []): string[] {
  const attrs = Array.from(el.attributes as unknown as ArrayLike<{ name: string; value: string }>).map((a) => `${a.name}=${/^(Id|URI|Target|ObjectReference)$/.test(a.name) && a.value !== '#comprobante' ? '*' : a.value}`);
  out.push([String(depth), el.tagName, ...attrs].join(' '));
  for (const c of Array.from(el.childNodes as unknown as ArrayLike<Node>)) if (c.nodeType === 1) skeletonOf(c as Element, depth + 1, out);
  return out;
}

describe('conformidad con el ejemplo oficial de la ficha (Anexo 14)', () => {
  const t = createTestP12();
  const creds = loadCredentialsFromP12(t.p12, t.password);
  const signed = signXml(buildFacturaXml(facturaBase).xml, creds, { signingTime: new Date('2026-10-10T21:57:32Z') });
  const doc = new DOMParser().parseFromString(signed, 'text/xml');
  const root = doc.documentElement as unknown as Element;
  const sig = root.getElementsByTagName('ds:Signature')[0] as unknown as Element;

  it('la estructura de la firma coincide elemento por elemento, con atributos y algoritmos', () => {
    expect(skeletonOf(sig).join('\n')).toBe(SKELETON);
  });
  it('la firma es el último hijo del comprobante', () => {
    const kids = Array.from(root.childNodes as unknown as ArrayLike<Node>).filter((n) => n.nodeType === 1) as Element[];
    expect(kids[kids.length - 1]?.tagName).toBe('ds:Signature');
  });
  it('SigningTime en hora de Ecuador con offset -05:00, como el ejemplo', () => {
    expect(signed).toContain('<etsi:SigningTime>2026-10-10T16:57:32-05:00</etsi:SigningTime>');
  });
  it('el exponente RSA es AQAB y el issuer va en orden RFC 2253 (CN primero)', () => {
    expect(signed).toContain('<ds:Exponent>AQAB</ds:Exponent>');
    expect(signed).toMatch(/<ds:X509IssuerName>CN=[^,]+,O=[^,]+,C=EC<\/ds:X509IssuerName>/);
  });
  it('la serie del certificado se escribe en decimal', () => {
    expect(signed).toMatch(/<ds:X509SerialNumber>\d+<\/ds:X509SerialNumber>/);
  });
  it('solo hay una declaración XML UTF-8 y ningún espacio entre elementos del comprobante', () => {
    expect(signed.startsWith('<?xml version="1.0" encoding="UTF-8"?><factura')).toBe(true);
    expect(signed).not.toMatch(/>\s+</);
  });
});
