# @ecuador-tax/identification

Validación de **formato y dígito verificador** de cédula y RUC (persona natural, sociedad privada y pública). No verifica existencia; para eso conecta tu proveedor con `IdentityVerifier`.

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/identification
```

```ts
import { validateCedula, validateRuc, validateIdentification } from '@ecuador-tax/identification';

const r = validateRuc('1790016919001');
if (r.ok) console.log(r.value.rucTipo); // 'sociedad-privada'
else console.log(r.error.code);        // p. ej. 'RUC_CHECK_DIGIT'
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
