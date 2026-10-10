# @ecuador-tax/testing

Herramientas para probar integraciones sin depender del SRI: simulador SOAP, fixtures sintéticos y generador de `.p12` de prueba. **Solo para desarrollo.**

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/testing
```

```ts
import { createMockSriFetch, mockAutorizacion, createTestP12, facturaBase } from '@ecuador-tax/testing';

const { fetch, calls } = createMockSriFetch({ /* guion por servicio */ });
const sri = new SriClient({ ambiente: Ambiente.Pruebas, fetch });
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
