# Comprobantes (experimental)

Fixtures completos en `packages/testing/src/fixtures.ts`; ejemplos de todas las secciones opcionales en `packages/xml/test/optional.test.ts`.
Importes como `string` decimal; fechas como `Date`.

| Función | Esquema | Opcionales soportados |
|---|---|---|
| `buildFacturaXml` | 1.1.0 (por defecto), 2.0.0, 2.1.0 (`version`) | exportación, reembolsos, subsidio, DIG, compensaciones, guía, placa, valorRetIva/Renta, retenciones (1.1 y 2.1), sustitutiva y rubros de terceros (2.x), negociable, máquina fiscal, ICE/IRBPNR, descuento adicional |
| `buildLiquidacionCompraXml` | 1.1.0 | reembolsos, negociable, máquina fiscal, descuento adicional |
| `buildNotaCreditoXml` | 1.1.0 | RISE, compensaciones, DIG, máquina fiscal |
| `buildNotaDebitoXml` | 1.0.0 | RISE, compensaciones, DIG, máquina fiscal |
| `buildRetencionXml` | 2.0.0 (ATS) | exterior, dividendos, reembolsos, cajas de banano, máquina fiscal |
| `buildGuiaRemisionXml` | 1.1.0 | RISE, máquina fiscal |

Todas devuelven `{ claveAcceso, xml }` sin firmar. El RUC del emisor debe terminar en `001` (así lo restringe el XSD).

## Cálculos que hace el SDK
`importeTotal = subtotal + impuestos + propina + flete + seguro + gastos aduaneros + otros − valorDevolucionIva`; `totalSubsidio = Σ cantidad × (precioSinSubsidio − precioUnitario)`; sumas de reembolsos; `valorModificacion`/`valorTotal` (restan la devolución del IVA).

## Catálogos
`PAISES` (tabla 25), `ICE_CODIGOS` (tabla 18), `FORMAS_PAGO`, `COMBUSTIBLES` (Anexo 16), `FUNDAS_PLASTICAS` (Anexo 18), `MATERIALES_CONSTRUCCION` (Anexo 23) se exportan desde `@ecuador-tax/xml`. Úsalos para llenar `codigoPrincipal`/`codigoAuxiliar` donde la ficha lo exige (combustibles, fundas, materiales de construcción: el SDK no los impone por línea porque depende de tu actividad). Gran contribuyente (Anexo 24): agrega un `infoAdicional` con la leyenda «Gran Contribuyente» y el número de resolución. Autorretención (Anexo 19): usa `codigoRetencion` 350 o 3481 con `codDocSustento` "42" y tu propia identificación como sujeto retenido.

## Validación contra XSD
`validateAgainstXsd(xml, xsdPath)` usa `xmllint`. Los XSD oficiales están en `docs/official-sri`; el esquema `xmldsig-core-schema.xsd` debe estar junto a ellos (hay una copia sin DOCTYPE en `packages/xml/test/schemas`).
