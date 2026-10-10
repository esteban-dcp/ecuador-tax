# @ecuador-tax/sri

Cliente SOAP de los servicios de recepción y autorización del SRI, con timeouts, diferenciación entre rechazo y fallo de transporte, y recuperación de envíos ambiguos (sin reintentos ciegos).

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/sri
```

```ts
import { SriClient } from '@ecuador-tax/sri';
import { Ambiente } from '@ecuador-tax/core';

const sri = new SriClient({ ambiente: Ambiente.Pruebas }); // obligatorio, sin valor por defecto
const r = await sri.enviarYAutorizar(xmlFirmado, claveAcceso);
// r.estado: AUTORIZADO | NO_AUTORIZADO | DEVUELTA | PENDIENTE
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
