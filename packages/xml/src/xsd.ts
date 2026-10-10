import { execFile } from 'node:child_process';
import { ConfigurationError, ValidationError } from '@ecuador-tax/core';

export interface XsdIssue {
  readonly line: number | undefined;
  readonly message: string;
}

/**
 * Valida un XML contra un XSD oficial usando `xmllint` (libxml2) del sistema.
 * El SDK no incluye los XSD del SRI: descárguelos de la sección oficial de
 * comprobantes electrónicos y pase la ruta. El XML se entrega por stdin
 * (nunca se escribe a disco ni se registra en logs).
 * Devuelve lista vacía si el documento es válido.
 */
export function validateAgainstXsd(xml: string, xsdPath: string, opts: { xmllintPath?: string; timeoutMs?: number } = {}): Promise<XsdIssue[]> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      opts.xmllintPath ?? 'xmllint',
      ['--noout', '--nonet', '--schema', xsdPath, '-'],
      { timeout: opts.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new ConfigurationError('XMLLINT_MISSING', 'xmllint no está instalado (paquete libxml2)'));
          return;
        }
        const lines = stderr.split('\n').filter((l) => l.trim() !== '' && !/validates$/.test(l));
        if (!error) return resolve([]);
        if (lines.length === 0) {
          reject(new ValidationError('XSD_RUN_FAILED', 'xmllint falló sin diagnóstico'));
          return;
        }
        resolve(
          lines.map((l) => {
            const m = /^-:(\d+): (.*)$/.exec(l);
            return { line: m ? Number(m[1]) : undefined, message: m ? (m[2] as string) : l };
          }),
        );
      },
    );
    child.stdin?.end(xml);
  });
}
