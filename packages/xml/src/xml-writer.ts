/** Escritor XML mínimo y determinista (sin dependencias, sin espacios entre nodos). */

const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function escapeXml(text: string): string {
  if (INVALID_XML_CHARS.test(text) || LONE_SURROGATE.test(text)) {
    throw new RangeError('El texto contiene caracteres de control no permitidos en XML 1.0');
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export type XmlChild = string | null | undefined;

export function el(name: string, content: readonly XmlChild[] | string, attrs?: Record<string, string>): string {
  const a = attrs
    ? Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join('')
    : '';
  const inner = typeof content === 'string' ? escapeXml(content) : content.filter((c): c is string => !!c).join('');
  return `<${name}${a}>${inner}</${name}>`;
}

/** Elemento opcional: devuelve `undefined` si el valor está ausente o vacío. */
export const opt = (name: string, value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : el(name, value);
