import forge from 'node-forge';

export interface TestP12 {
  readonly p12: Uint8Array;
  readonly password: string;
}

/**
 * Genera en memoria un certificado autofirmado SINTÉTICO y lo empaqueta en PKCS#12.
 * Solo para pruebas: no es un certificado de firma electrónica válido ante el SRI.
 */
export function createTestP12(opts: { password?: string; cn?: string; notBefore?: Date; notAfter?: Date; bits?: number } = {}): TestP12 {
  const password = opts.password ?? 'test-password';
  const keys = forge.pki.rsa.generateKeyPair({ bits: opts.bits ?? 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01a2b3c4d5e6f7';
  cert.validity.notBefore = opts.notBefore ?? new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 86_400_000);
  // Orden de codificación habitual de las entidades certificadoras: C, O, CN (el issuer se escribe invertido en XAdES).
  const attrs = [
    { name: 'countryName', value: 'EC' },
    { name: 'organizationName', value: 'ECUADOR TAX SDK TEST' },
    { name: 'commonName', value: opts.cn ?? 'CERTIFICADO DE PRUEBA SDK' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'keyUsage', digitalSignature: true, nonRepudiation: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  const der = forge.asn1.toDer(asn1).getBytes();
  return { p12: Uint8Array.from(Buffer.from(der, 'latin1')), password };
}
