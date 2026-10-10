# Prueba de integración en el ambiente de certificación

Requisitos (no se incluyen en el repo): RUC registrado en pruebas de facturación electrónica, certificado `.p12` vigente y su contraseña.

```
SRI_P12_PATH=/ruta/cert.p12 SRI_P12_PASSWORD=... SRI_RUC=<ruc> pnpm vitest run --config vitest.integration.config.ts
```
La prueba emite una factura sintética en el ambiente `1` (pruebas) y espera `AUTORIZADO`. Nunca se ejecuta en CI ni contra producción.
