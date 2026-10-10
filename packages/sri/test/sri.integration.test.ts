import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Ambiente } from '@ecuador-tax/core';
import { facturaBase } from '@ecuador-tax/testing';
import { buildFacturaXml } from '@ecuador-tax/xml';
import { loadCredentialsFromP12, signXml } from '@ecuador-tax/signature';
import { SriClient } from '@ecuador-tax/sri';

const { SRI_P12_PATH, SRI_P12_PASSWORD, SRI_RUC } = process.env;

describe.skipIf(!SRI_P12_PATH || !SRI_P12_PASSWORD || !SRI_RUC)('SRI certificación (real)', () => {
  it('emite y autoriza una factura en pruebas', async () => {
    const seq = String(Date.now() % 1_000_000_000).padStart(9, '0');
    const { xml, claveAcceso } = buildFacturaXml({
      ...facturaBase,
      ambiente: Ambiente.Pruebas,
      fechaEmision: new Date(),
      secuencial: seq,
      emisor: { ...facturaBase.emisor, ruc: SRI_RUC! },
    });
    const firmado = signXml(xml, loadCredentialsFromP12(await readFile(SRI_P12_PATH!), SRI_P12_PASSWORD!));
    const r = await new SriClient({ ambiente: Ambiente.Pruebas }).enviarYAutorizar(firmado, claveAcceso);
    expect(r.estado, JSON.stringify(r, (k, v) => (k === 'comprobante' ? undefined : v))).toBe('AUTORIZADO');
  });
});
