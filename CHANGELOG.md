# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [0.1.1] — 2026-10-10

### Cambiado
- `@ecuador-tax/signature`: `SigningTime` se escribe en hora de Ecuador con offset `-05:00` (como el ejemplo oficial del Anexo 14 de la ficha técnica) en lugar de UTC con `Z`.
- La estructura de la firma XAdES-BES se verifica en pruebas elemento por elemento contra el ejemplo oficial.
- `@ecuador-tax/testing`: el certificado sintético usa el orden de DN habitual de las entidades certificadoras.

### Interno
- Publicación en npm desde GitHub Actions con provenance (trusted publishing).

## [0.1.0] — 2026-10-10

### Añadido
- `@ecuador-tax/core`: errores tipados, `Result`, enums (ambiente, tipo de comprobante), formato decimal/fecha del SRI.
- `@ecuador-tax/identification`: validación de cédula y RUC (persona natural, sociedad privada y pública).
- `@ecuador-tax/access-key`: generación, descomposición y validación de la clave de acceso de 49 dígitos.
- `@ecuador-tax/xml` (**experimental**): generación determinista de factura, liquidación de compra, nota de crédito, nota de débito, retención y guía de remisión, validados contra los XSD oficiales; validación XSD opcional vía `xmllint`.
- `@ecuador-tax/xml`: secciones opcionales completas (exportación, reembolsos, subsidios, DIG, sustitutiva, rubros de terceros, negociable, máquina fiscal, RISE, compensaciones; retención con exterior/dividendos/reembolsos/banano), catálogos de la ficha (países, ICE, formas de pago…), versiones de factura 1.1.0/2.0.0/2.1.0.
- `@ecuador-tax/identification`: contrato `IdentityVerifier`/`validateAndVerify` para verificación de existencia por terceros.
- `@ecuador-tax/signature` (**experimental**): XAdES-BES (RSA-SHA1) desde PKCS#12; verificación local.
- `@ecuador-tax/sri` (**experimental**): cliente SOAP de recepción/autorización con recuperación de envíos ambiguos.
- `@ecuador-tax/testing`: simulador del SRI, fixture de factura y generador de PKCS#12 sintético.
