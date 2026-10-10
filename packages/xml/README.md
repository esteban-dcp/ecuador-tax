# @ecuador-tax/xml

Generación determinista de los XML de factura, liquidación de compra, nota de crédito, nota de débito, retención y guía de remisión, con validación de las reglas de la ficha técnica y validación opcional contra XSD (`xmllint`).

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/xml
```

```ts
import { buildFacturaXml, validateAgainstXsd } from '@ecuador-tax/xml';

const { xml, claveAcceso } = buildFacturaXml({ /* ver README del repositorio y docs/comprobantes.md */ });
const errores = await validateAgainstXsd(xml, '/ruta/factura_V1.1.0.xsd'); // [] si es válido
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
