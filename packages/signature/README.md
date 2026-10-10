# @ecuador-tax/signature

Firma XAdES-BES (RSA-SHA1, requerido por la ficha técnica) desde PKCS#12, y verificación local. Las credenciales nunca se serializan ni se registran.

Parte de [Ecuador Tax SDK](https://github.com/esteban-dcp/ecuador-tax). Node.js ≥ 20.3, solo ESM, licencia MIT.

```bash
npm install @ecuador-tax/signature
```

```ts
import { loadCredentialsFromP12, signXml, verifySignedXml } from '@ecuador-tax/signature';

const creds = loadCredentialsFromP12(p12Bytes, password); // lanza CryptoError sin filtrar secretos
const firmado = signXml(xml, creds);
verifySignedXml(firmado).valid; // true
```

Documentación completa, estado de verificación y limitaciones: <https://github.com/esteban-dcp/ecuador-tax#readme>
