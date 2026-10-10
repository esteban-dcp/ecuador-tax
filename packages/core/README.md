# @ecuador-tax/core

Tipos, errores tipados, `Result` y utilidades compartidas (importes y fechas del SRI).

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/core
```

```ts
import { formatDecimal, Ambiente, TipoComprobante, ValidationError } from '@ecuador-tax/core';

formatDecimal('1.005', 2); // '1.01' (aritmética decimal exacta)
TipoComprobante.Factura;   // '01'
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
