import forge from 'node-forge';
import { CryptoError } from '@ecuador-tax/core';

/**
 * Credenciales de firma cargadas desde un PKCS#12 (.p12/.pfx).
 *
 * Seguridad: el objeto es opaco; la clave privada vive solo en memoria dentro
 * de una clausura y nunca se serializa (`toJSON`/`inspect` devuelven un
 * marcador). El SDK no persiste ni registra certificados ni contraseñas.
 * Los mensajes de error no incluyen contenido del archivo ni la contraseña.
 */
export interface SigningCredentials {
  /** Certificado X.509 en DER, base64 (sin saltos de línea). */
  readonly certificateBase64: string;
  readonly modulusBase64: string;
  readonly exponentBase64: string;
  readonly issuerName: string;
  readonly serialNumber: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly subjectCommonName: string | undefined;
  /** SHA-1 del certificado DER, base64 (para XAdES SigningCertificate). */
  readonly certificateSha1Base64: string;
  /** Firma RSA PKCS#1 v1.5 con SHA-1 (requerido por la ficha técnica del SRI). Devuelve base64. */
  signSha1(data: Uint8Array): string;
}

export interface LoadOptions {
  /** Reloj inyectable para pruebas. */
  readonly now?: Date;
  /** Permite cargar certificados caducados (solo para verificación/pruebas). Por defecto `false`. */
  readonly allowExpired?: boolean;
}

const OID_KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const OID_SHROUDED_KEY_BAG = '1.2.840.113549.1.12.10.1.2';
const OID_CERT_BAG = '1.2.840.113549.1.12.10.1.3';

const bytesToBinary = (b: Uint8Array): string => Buffer.from(b).toString('latin1');

function rfc2253(attrs: forge.pki.CertificateField[]): string {
  const esc = (v: string) => v.replace(/([,+"\\<>;])/g, '\\$1').replace(/^([# ])/, '\\$1').replace(/ $/, '\\ ');
  return [...attrs]
    .reverse()
    .map((a) => `${a.shortName ?? a.name ?? a.type}=${esc(String(a.value))}`)
    .join(',');
}

export function loadCredentialsFromP12(p12: Uint8Array, password: string, options: LoadOptions = {}): SigningCredentials {
  let pkcs12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytesToBinary(p12)));
    pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (cause) {
    throw new CryptoError('P12_UNREADABLE', 'No se pudo abrir el PKCS#12: formato inválido o contraseña incorrecta', { cause: undefined });
  }

  const keyBags = [
    ...(pkcs12.getBags({ bagType: OID_SHROUDED_KEY_BAG })[OID_SHROUDED_KEY_BAG] ?? []),
    ...(pkcs12.getBags({ bagType: OID_KEY_BAG })[OID_KEY_BAG] ?? []),
  ];
  const privateKey = keyBags.map((b) => b.key).find((k): k is forge.pki.rsa.PrivateKey => !!k && 'd' in k);
  if (!privateKey) throw new CryptoError('P12_NO_RSA_KEY', 'El PKCS#12 no contiene una clave privada RSA');

  const certs = (pkcs12.getBags({ bagType: OID_CERT_BAG })[OID_CERT_BAG] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const matching = certs.filter((c) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub.n.compareTo(privateKey.n) === 0 && pub.e.compareTo(privateKey.e) === 0;
  });
  if (matching.length === 0) throw new CryptoError('P12_NO_MATCHING_CERT', 'Ningún certificado del PKCS#12 corresponde a la clave privada');
  // Si hay varios, preferir el que declara digitalSignature.
  const cert =
    matching.find((c) => {
      const ku = c.getExtension('keyUsage') as { digitalSignature?: boolean } | null;
      return ku?.digitalSignature === true;
    }) ?? (matching[0] as forge.pki.Certificate);

  const now = options.now ?? new Date();
  if (!options.allowExpired) {
    if (now < cert.validity.notBefore) throw new CryptoError('CERT_NOT_YET_VALID', 'El certificado aún no es válido');
    if (now > cert.validity.notAfter) throw new CryptoError('CERT_EXPIRED', 'El certificado ha caducado');
  }

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  const b64 = (bn: forge.jsbn.BigInteger) => forge.util.encode64(forge.util.hexToBytes(padHex(bn.toString(16))));
  const sha1 = forge.md.sha1.create().update(der).digest().getBytes();
  const cn = cert.subject.getField('CN') as { value?: string } | null;

  const creds: SigningCredentials = {
    certificateBase64: forge.util.encode64(der),
    modulusBase64: b64(pub.n),
    exponentBase64: b64(pub.e),
    issuerName: rfc2253(cert.issuer.attributes),
    serialNumber: BigInt('0x' + cert.serialNumber).toString(10),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    subjectCommonName: cn?.value,
    certificateSha1Base64: forge.util.encode64(sha1),
    signSha1(data) {
      try {
        const md = forge.md.sha1.create();
        md.update(bytesToBinary(data));
        return forge.util.encode64(privateKey.sign(md));
      } catch {
        throw new CryptoError('SIGN_FAILED', 'Falló la firma con la clave privada');
      }
    },
  };
  // Evitar fugas accidentales por serialización/inspección.
  Object.defineProperty(creds, 'toJSON', { value: () => '[SigningCredentials]', enumerable: false });
  Object.defineProperty(creds, Symbol.for('nodejs.util.inspect.custom'), { value: () => '[SigningCredentials]', enumerable: false });
  return creds;
}

function padHex(h: string): string {
  return h.length % 2 === 0 ? h : '0' + h;
}
