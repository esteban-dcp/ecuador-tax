import { describe, expect, it } from 'vitest';
import { isValidCedula, isValidRuc, validateCedula, validateIdentification, validateRuc } from '@ecuador-tax/identification';

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error?.code);

describe('validateCedula', () => {
  it('acepta cédulas válidas', () => {
    expect(validateCedula('1710034065').ok).toBe(true);
    expect(isValidCedula('0926687856')).toBe(true);
  });
  it.each([
    ['171003406', 'CEDULA_FORMAT'],
    ['17100340655', 'CEDULA_FORMAT'],
    ['17100340a5', 'CEDULA_FORMAT'],
    ['', 'CEDULA_FORMAT'],
    [' 1710034065', 'CEDULA_FORMAT'],
    ['2510034065', 'CEDULA_PROVINCE'],
    ['0010034065', 'CEDULA_PROVINCE'],
    ['1760034065', 'CEDULA_THIRD_DIGIT'],
    ['1710034064', 'CEDULA_CHECK_DIGIT'],
  ])('rechaza %s', (v, c) => expect(code(validateCedula(v))).toBe(c));
  it('acepta provincia 30 (exterior) con dígito correcto', () => {
    // 30 + 1 + 000000 + dv: 3,0,1,0,0,0,0,0,0 -> 6+0+2+0+0+0+0+0+0 = 8 -> dv 2
    expect(validateCedula('3010000002').ok).toBe(true);
  });
  it('dígito verificador 0 cuando la suma es múltiplo de 10', () => {
    // 0,1,0,9 -> 0+1+0+9 = 10 -> dv 0
    expect(validateCedula('0109000000').ok).toBe(true);
  });
});

describe('validateRuc', () => {
  it('persona natural', () => {
    const r = validateRuc('1710034065001');
    expect(r.ok && r.value.rucTipo).toBe('persona-natural');
    expect(r.ok && r.value.establecimiento).toBe('001');
  });
  it('sociedad privada', () => {
    const r = validateRuc('1790016919001');
    expect(r.ok && r.value.rucTipo).toBe('sociedad-privada');
  });
  it('sociedad pública', () => {
    const r = validateRuc('1760001550001');
    expect(r.ok && r.value.rucTipo).toBe('sociedad-publica');
    expect(r.ok && r.value.establecimiento).toBe('0001');
  });
  it.each([
    ['171003406500', 'RUC_FORMAT'],
    ['1710034065000', 'RUC_ESTABLISHMENT'],
    ['1710034064001', 'RUC_CHECK_DIGIT'],
    ['1790016918001', 'RUC_CHECK_DIGIT'],
    ['1790016919000', 'RUC_ESTABLISHMENT'],
    ['1760001540001', 'RUC_CHECK_DIGIT'],
    ['1760001550000', 'RUC_ESTABLISHMENT'],
    ['1770016919001', 'RUC_THIRD_DIGIT'],
    ['9990016919001', 'RUC_PROVINCE'],
  ])('rechaza %s', (v, c) => expect(code(validateRuc(v))).toBe(c));
  it('isValidRuc', () => expect(isValidRuc('1790016919001')).toBe(true));
});

describe('validateIdentification', () => {
  it('despacha por longitud', () => {
    const c = validateIdentification('1710034065');
    const r = validateIdentification('1790016919001');
    expect(c.ok && c.value.tipo).toBe('cedula');
    expect(r.ok && r.value.tipo).toBe('ruc');
    expect(code(validateIdentification('123'))).toBe('IDENTIFICATION_FORMAT');
  });
});

describe('validateAndVerify', () => {
  it('consulta al verificador solo con formato válido y degrada a unknown ante fallos', async () => {
    const { validateAndVerify } = await import('@ecuador-tax/identification');
    let calls = 0;
    const ok = { verify: async () => (calls++, 'exists' as const) };
    const boom = { verify: async () => { throw new Error('red'); } };
    const a = await validateAndVerify('1710034065', ok);
    expect(a.ok && a.value.status).toBe('exists');
    const b = await validateAndVerify('1710034065', boom);
    expect(b.ok && b.value.status).toBe('unknown');
    const c = await validateAndVerify('1710034064', ok);
    expect(c.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

describe('validateAndVerify cancelación', () => {
  it('propaga el aborto', async () => {
    const { validateAndVerify } = await import('@ecuador-tax/identification');
    const ac = new AbortController();
    ac.abort();
    await expect(validateAndVerify('1710034065', { verify: async () => { throw new DOMException('abort', 'AbortError'); } }, { signal: ac.signal })).rejects.toBeTruthy();
  });
});
