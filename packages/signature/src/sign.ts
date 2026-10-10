import { randomInt } from 'node:crypto';
import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';
import { CryptoError, ValidationError } from '@ecuador-tax/core';
import type { SigningCredentials } from './credentials.js';

export const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
export const NS_ETSI = 'http://uri.etsi.org/01903/v1.3.2#';
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ALG_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const ALG_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

export interface SignOptions {
  /** Momento de la firma (xs:dateTime). Por defecto, ahora. */
  readonly signingTime?: Date;
  /** Id del elemento raíz a firmar. Por defecto `comprobante`. */
  readonly referenceId?: string;
}

const c14n = new C14nCanonicalization();

function parse(xml: string): Document {
  const errors: string[] = [];
  let doc: Document;
  try {
    doc = new DOMParser({
      onError: (level, msg) => {
        if (level !== 'warning') errors.push(msg);
      },
    }).parseFromString(xml, 'text/xml') as unknown as Document;
  } catch {
    throw new ValidationError('XML_NOT_WELL_FORMED', 'El XML a firmar no está bien formado');
  }
  if (errors.length > 0 || !doc.documentElement) {
    throw new ValidationError('XML_NOT_WELL_FORMED', 'El XML a firmar no está bien formado');
  }
  return doc;
}

/** Canonicaliza (C14N 1.0 inclusiva) un fragmento que declara explícitamente los prefijos ds y etsi en su ápice. */
function canonFragment(fragment: string): string {
  const withNs = fragment.replace(/^<([\w:]+)/, `<$1 xmlns:ds="${NS_DS}" xmlns:etsi="${NS_ETSI}"`);
  return c14n.process(parse(withNs).documentElement, {}) as string;
}

const sha1b64 = (s: string): string => forge.util.encode64(forge.md.sha1.create().update(forge.util.encodeUtf8(s)).digest().getBytes());

/**
 * Firma un comprobante con XAdES-BES (enveloped, C14N 1.0, RSA-SHA1/SHA1) en la
 * forma exigida por la ficha técnica del SRI. La firma se agrega como último hijo del elemento raíz,
 * que debe tener `id="comprobante"`.
 *
 * Nota: SHA-1 es el algoritmo que exige actualmente la ficha técnica; no es una elección del SDK.
 */
export function signXml(xml: string, credentials: SigningCredentials, options: SignOptions = {}): string {
  const refId = options.referenceId ?? 'comprobante';
  const body = xml.replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*\?>\s*/, '').trimEnd();
  const doc = parse(body);
  const root = doc.documentElement;
  if (root.getAttribute('id') !== refId) {
    throw new ValidationError('SIGN_ROOT_ID', `El elemento raíz debe tener id="${refId}"`);
  }
  if (Array.from(root.childNodes).some((n) => n.nodeType === 1 && (n as Element).localName === 'Signature')) {
    throw new ValidationError('SIGN_ALREADY_SIGNED', 'El documento ya contiene una firma');
  }
  for (const a of Array.from(root.attributes)) {
    if (a.name === 'xmlns' || a.name.startsWith('xmlns:') || a.name.startsWith('xml:')) {
      throw new ValidationError('SIGN_ROOT_NAMESPACES', 'El elemento raíz no puede declarar namespaces ni atributos xml:* (la canonicalización en contexto no los soporta)');
    }
  }
  const closing = `</${root.tagName}>`;
  if (!body.endsWith(closing)) throw new ValidationError('SIGN_ROOT_CLOSE', 'No se pudo ubicar el cierre del elemento raíz');

  const n = () => String(randomInt(1, 1_000_000));
  const [sigN, objN, spN, refN, certN, valN, infoN, docRefN] = [n(), n(), n(), n(), n(), n(), n(), n()];
  const sigId = `Signature${sigN}`;
  const spId = `${sigId}-SignedProperties${spN}`;
  const certId = `Certificate${certN}`;
  const docRefId = `Reference-ID-${docRefN}`;

  const signingTime = (options.signingTime ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const signedProperties =
    `<etsi:SignedProperties Id="${spId}"><etsi:SignedSignatureProperties>` +
    `<etsi:SigningTime>${signingTime}</etsi:SigningTime>` +
    `<etsi:SigningCertificate><etsi:Cert><etsi:CertDigest>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod>` +
    `<ds:DigestValue>${credentials.certificateSha1Base64}</ds:DigestValue></etsi:CertDigest>` +
    `<etsi:IssuerSerial><ds:X509IssuerName>${esc(credentials.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${credentials.serialNumber}</ds:X509SerialNumber></etsi:IssuerSerial>` +
    `</etsi:Cert></etsi:SigningCertificate></etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties><etsi:DataObjectFormat ObjectReference="#${docRefId}">` +
    `<etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType>` +
    `</etsi:DataObjectFormat></etsi:SignedDataObjectProperties></etsi:SignedProperties>`;

  const keyInfo =
    `<ds:KeyInfo Id="${certId}"><ds:X509Data><ds:X509Certificate>${credentials.certificateBase64}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${credentials.modulusBase64}</ds:Modulus>` +
    `<ds:Exponent>${credentials.exponentBase64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue></ds:KeyInfo>`;

  // Digest del documento: C14N del raíz sin firma (transform enveloped-signature).
  const docDigest = sha1b64(c14n.process(root, {}) as string);
  const spDigest = sha1b64(canonFragment(signedProperties));
  const kiDigest = sha1b64(canonFragment(keyInfo));

  const ref = (attrs: string, uri: string, transforms: string, digest: string) =>
    `<ds:Reference ${attrs}URI="${uri}">${transforms}<ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod>` +
    `<ds:DigestValue>${digest}</ds:DigestValue></ds:Reference>`;

  const signedInfo =
    `<ds:SignedInfo Id="Signature-SignedInfo${infoN}">` +
    `<ds:CanonicalizationMethod Algorithm="${ALG_C14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${ALG_RSA_SHA1}"></ds:SignatureMethod>` +
    ref(`Id="SignedPropertiesID${refN}" Type="http://uri.etsi.org/01903#SignedProperties" `, `#${spId}`, '', spDigest) +
    ref('', `#${certId}`, '', kiDigest) +
    ref(`Id="${docRefId}" `, `#${refId}`, `<ds:Transforms><ds:Transform Algorithm="${ALG_ENVELOPED}"></ds:Transform></ds:Transforms>`, docDigest) +
    `</ds:SignedInfo>`;

  let signatureValue: string;
  try {
    signatureValue = credentials.signSha1(Buffer.from(canonFragment(signedInfo), 'utf8'));
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('SIGN_FAILED', 'Falló la firma');
  }
  const wrapped = signatureValue.replace(/(.{76})/g, '$1\n');

  const signature =
    `<ds:Signature xmlns:ds="${NS_DS}" xmlns:etsi="${NS_ETSI}" Id="${sigId}">` +
    signedInfo +
    `<ds:SignatureValue Id="SignatureValue${valN}">\n${wrapped}\n</ds:SignatureValue>` +
    keyInfo +
    `<ds:Object Id="${sigId}-Object${objN}"><etsi:QualifyingProperties Target="#${sigId}">${signedProperties}</etsi:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`;

  return '<?xml version="1.0" encoding="UTF-8"?>' + body.slice(0, -closing.length) + signature + closing;
}
