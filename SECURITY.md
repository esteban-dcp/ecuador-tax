# Política de seguridad

Este SDK maneja certificados de firma electrónica y documentos tributarios. Si encuentras una vulnerabilidad
(fuga de claves o contraseñas, verificación de firma evitable, inyección en el XML, etc.):

1. **No abras un issue público.** Usa [«Report a vulnerability»](https://github.com/esteban-dcp/ecuador-tax/security/advisories/new) de GitHub.
2. Incluye una descripción, los pasos para reproducirla y el impacto. Nunca adjuntes certificados, claves ni datos tributarios reales.

No se prometen tiempos de respuesta, pero se revisará de buena fe y se publicará un aviso cuando haya corrección.

Versiones soportadas: solo la última `0.x`.

## Dependencias conocidas

- `node-forge` ≤ 1.4.0 tiene el aviso GHSA-86w9-cpqp-85rv (*verificación* de firmas RSA PKCS#1 v1.5). El SDK usa `node-forge` solo para leer el PKCS#12 y **firmar**; la verificación de firmas la hace `xml-crypto` con la API de `crypto` de Node. Al momento de publicar no existía una versión corregida en npm; se actualizará en cuanto salga.
