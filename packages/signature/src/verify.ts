import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { CryptoError } from '@ecuador-tax/core';
import { NS_DS } from './sign.js';

export interface VerifyResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Certificado X.509 (DER base64) incluido en la firma, si existe. */
  readonly certificateBase64: string | undefined;
}

/**
 * Verifica integridad e identidad criptográfica de una firma XML: referencias (digests) y
 * SignatureValue con el certificado embebido. NO valida la cadena de confianza ni la revocación
 * del certificado (el SRI lo hace en su lado).
 */
export function verifySignedXml(xml: string): VerifyResult {
  let doc: Document;
  try {
    doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    return { valid: false, errors: ['XML mal formado'], certificateBase64: undefined };
  }
  if (!doc.documentElement) return { valid: false, errors: ['XML mal formado'], certificateBase64: undefined };
  const sigs = doc.getElementsByTagNameNS(NS_DS, 'Signature');
  if (sigs.length !== 1) return { valid: false, errors: [`se esperaba 1 firma, hay ${sigs.length}`], certificateBase64: undefined };
  const sig = sigs[0]!;
  const rootId = doc.documentElement.getAttribute('id');
  if (sig.parentNode !== (doc.documentElement as unknown as Node)) {
    return { valid: false, errors: ['la firma debe ser hija directa del elemento raíz'], certificateBase64: undefined };
  }
  const refs = Array.from(sig.getElementsByTagNameNS(NS_DS, 'Reference'));
  if (!rootId || !refs.some((r) => r.getAttribute('URI') === `#${rootId}`)) {
    return { valid: false, errors: ['ninguna referencia firma el elemento raíz'], certificateBase64: undefined };
  }
  const certEl = sigs[0]!.getElementsByTagNameNS(NS_DS, 'X509Certificate')[0];
  const certificateBase64 = certEl?.textContent?.replace(/\s+/g, '');
  if (!certificateBase64) return { valid: false, errors: ['la firma no incluye certificado'], certificateBase64: undefined };
  const pem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
  try {
    const sx = new SignedXml({ publicCert: pem });
    sx.loadSignature(sigs[0] as unknown as Node);
    const valid = sx.checkSignature(xml);
    return { valid, errors: valid ? [] : ['firma o digest no coinciden'], certificateBase64 };
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    return { valid: false, errors: [e instanceof Error ? e.message : 'error de verificación'], certificateBase64 };
  }
}
