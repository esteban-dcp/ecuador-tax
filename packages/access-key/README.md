# @ecuador-tax/access-key

Generación, descomposición y validación de la clave de acceso de 49 dígitos (dígito verificador módulo 11).

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/access-key
```

```ts
import { generateAccessKey, parseAccessKey } from '@ecuador-tax/access-key';
import { Ambiente, TipoComprobante } from '@ecuador-tax/core';

const k = generateAccessKey({
  fechaEmision: new Date(), tipoComprobante: TipoComprobante.Factura, ruc: '1790016919001',
  ambiente: Ambiente.Pruebas, establecimiento: '001', puntoEmision: '001', secuencial: '000000001',
});
if (k.ok) console.log(parseAccessKey(k.value));
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
