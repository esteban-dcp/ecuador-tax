<div align="center">

# 🇪🇨 Ecuador Tax SDK

**Facturación electrónica del SRI para TypeScript — modular, tipada y sin servidores de por medio.**

Valida cédulas y RUC, genera claves de acceso, construye los XML de los 6 comprobantes electrónicos, los firma con XAdES-BES y habla con los servicios SOAP del SRI. Todo corre en tu infraestructura.

[![CI](https://github.com/esteban-dcp/ecuador-tax/actions/workflows/ci.yml/badge.svg)](https://github.com/esteban-dcp/ecuador-tax/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A5%2020-339933)
![TypeScript estricto](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Estado: experimental](https://img.shields.io/badge/estado-experimental-orange)

</div>

> [!WARNING]
> **Versión 0.1: experimental.** Los XML validan contra los XSD oficiales y el cliente SOAP lee las respuestas reales del ambiente de certificación, pero **todavía no hay evidencia de una autorización real de punta a punta** (falta un RUC y un certificado de pruebas). Lee [Qué está verificado y qué no](#-qué-está-verificado-y-qué-no) antes de emitir comprobantes con valor tributario.

---

## ¿Por qué existe?

Cada sistema de facturación ecuatoriano reimplementa lo mismo: validar identificaciones, armar la clave de acceso de 49 dígitos, serializar XML contra la ficha técnica, firmar con XAdES-BES y hablar SOAP con el SRI. Este proyecto reúne esas piezas en paquetes pequeños e independientes que puedes usar por separado.

- **No es un SaaS ni un ERP.** Es una biblioteca: instálala y ejecútala donde quieras.
- **Sin framework.** Funciona en cualquier aplicación Node.js (Express, NestJS, scripts, workers…).
- **La precisión manda sobre la cantidad.** Cada regla sale de la ficha técnica v2.34 y de los XSD oficiales, y se prueba.
- **Seguro por defecto.** Los certificados nunca se serializan, no se registran y TLS siempre se verifica.

## Paquetes

| Paquete | Qué hace | Estado |
|---|---|---|
| [`@ecuador-tax/core`](packages/core) | Errores tipados, `Result`, enums, formato de importes y fechas | 🟢 estable (0.x) |
| [`@ecuador-tax/identification`](packages/identification) | Cédula y RUC: formato + dígito verificador; contrato para verificación de existencia | 🟢 estable (0.x) |
| [`@ecuador-tax/access-key`](packages/access-key) | Generar, descomponer y validar la clave de acceso de 49 dígitos | 🟢 estable (0.x) |
| [`@ecuador-tax/xml`](packages/xml) | XML de factura, liquidación de compra, nota de crédito, nota de débito, retención y guía de remisión | 🟠 experimental |
| [`@ecuador-tax/signature`](packages/signature) | Firma XAdES-BES (RSA-SHA1) desde `.p12` + verificación local | 🟠 experimental |
| [`@ecuador-tax/sri`](packages/sri) | Cliente SOAP de recepción y autorización con recuperación de envíos ambiguos | 🟠 experimental |
| [`@ecuador-tax/testing`](packages/testing) | Simulador del SRI, fixtures sintéticos y generador de `.p12` de prueba | 🔵 desarrollo |

## Instalación

```bash
npm install @ecuador-tax/xml @ecuador-tax/signature @ecuador-tax/sri
# o solo lo que necesites:
npm install @ecuador-tax/identification
```

Requiere **Node.js ≥ 20.3**. ESM únicamente. Ejecuta tu proceso con `TZ=America/Guayaquil` para que las fechas de emisión coincidan con las del SRI.

## Inicio rápido

### Validar identificaciones

```ts
import { validateIdentification } from '@ecuador-tax/identification';

const r = validateIdentification('1710034065');
if (r.ok) console.log(r.value.tipo);        // 'cedula'
else console.error(r.error.code);           // p. ej. 'CEDULA_CHECK_DIGIT'
```

### Emitir una factura de punta a punta

```ts
import { readFile } from 'node:fs/promises';
import { Ambiente } from '@ecuador-tax/core';
import { buildFacturaXml } from '@ecuador-tax/xml';
import { loadCredentialsFromP12, signXml } from '@ecuador-tax/signature';
import { SriClient } from '@ecuador-tax/sri';

// 1. XML sin firmar + clave de acceso
const { xml, claveAcceso } = buildFacturaXml({
  ambiente: Ambiente.Pruebas,
  fechaEmision: new Date(),
  secuencial: '000000001',
  emisor: {
    ruc: '1790000000001',
    razonSocial: 'MI EMPRESA S.A.',
    establecimiento: '001',
    puntoEmision: '001',
    direccionMatriz: 'Av. Principal 123, Quito',
    obligadoContabilidad: true,
  },
  comprador: { tipoIdentificacion: '05', identificacion: '1710034065', razonSocial: 'JUAN PÉREZ' },
  detalles: [
    {
      codigoPrincipal: 'P001',
      descripcion: 'Producto A',
      cantidad: '2',
      precioUnitario: '10',
      descuento: '0',
      precioTotalSinImpuesto: '20',
      // Código y tarifa según la tabla 17 de la ficha técnica (4 = IVA 15 %)
      impuestos: [{ codigo: '2', codigoPorcentaje: '4', tarifa: '15', baseImponible: '20', valor: '3' }],
    },
  ],
  pagos: [{ formaPago: '01', total: '23' }],
});

// 2. Firma (el .p12 y su contraseña nunca van al repositorio)
const creds = loadCredentialsFromP12(await readFile(process.env.P12_PATH!), process.env.P12_PASSWORD!);
const firmado = signXml(xml, creds);

// 3. Envío y autorización. El ambiente es obligatorio: no hay valor por defecto.
const sri = new SriClient({ ambiente: Ambiente.Pruebas });
const r = await sri.enviarYAutorizar(firmado, claveAcceso);

switch (r.estado) {
  case 'AUTORIZADO':    /* guarda r.autorizacion.numeroAutorizacion y el XML autorizado */ break;
  case 'NO_AUTORIZADO': /* revisa r.autorizacion.mensajes */ break;
  case 'DEVUELTA':      /* el SRI no lo registró: corrige r.recepcion.comprobantes[].mensajes */ break;
  case 'PENDIENTE':     /* recibida pero sin resolución: consulta de nuevo con sri.autorizacion(claveAcceso) */ break;
}
```

> Los importes son **cadenas decimales** (`'23.00'`), nunca `number`, para evitar errores de coma flotante.

## Cómo está armado

```
 datos de negocio                                         SRI
       │                                                   ▲
       ▼                                                   │ SOAP (TLS verificado)
 ┌───────────┐  XML   ┌────────────┐  XML firmado  ┌────────────┐
 │ @…/xml    │ ─────▶ │ @…/signature│ ────────────▶ │ @…/sri     │
 │ (+ access-│        │  XAdES-BES │               │ recepción +│
 │  key)     │        └────────────┘               │ autorización
 └───────────┘                                      └────────────┘
       ▲
 @…/identification · @…/core (errores, tipos, utilidades)
```

Los módulos tributarios no dependen del transporte SOAP ni de ningún framework web.

## Comprobantes soportados

| Comprobante | Función | Esquema |
|---|---|---|
| Factura | `buildFacturaXml` | 1.1.0 (defecto), 2.0.0, 2.1.0 |
| Liquidación de compra | `buildLiquidacionCompraXml` | 1.1.0 |
| Nota de crédito | `buildNotaCreditoXml` | 1.1.0 |
| Nota de débito | `buildNotaDebitoXml` | 1.0.0 |
| Comprobante de retención (ATS) | `buildRetencionXml` | 2.0.0 |
| Guía de remisión | `buildGuiaRemisionXml` | 1.1.0 |

Secciones opcionales incluidas: exportación, reembolsos, subsidios, devolución del IVA, compensaciones, factura sustitutiva de guía, rubros de terceros, retenciones en factura, factura negociable, máquina fiscal, RISE, ICE/IRBPNR y, en retención, pago al exterior, dividendos y cajas de banano. Detalle en [`docs/comprobantes.md`](docs/comprobantes.md).

Además de la estructura, el SDK **valida las reglas que el SRI aplica al recibir**: tarifa de IVA ↔ código (tabla 17), `valor = base × tarifa`, totales por línea, suma de pagos, límite de consumidor final (50 USD), propina ≤ 10 %, fechas de guía, condiciones del Anexo 10, y más. Un documento incoherente falla en tu máquina con un `ValidationError` claro, no con el error 52 del SRI.

## Manejo de errores

Todos los errores extienden `EcuadorTaxError` y distinguen su origen:

| Clase | Cuándo |
|---|---|
| `ValidationError` | Datos de entrada que incumplen una regla (`code` estable, p. ej. `TAX_VALUE`) |
| `ConfigurationError` | Ambiente o URL ausentes o inválidos |
| `CryptoError` | Certificado inválido, caducado o contraseña incorrecta (nunca incluye secretos) |
| `SriRejectionError` | El SRI respondió con un estado inesperado |
| `TransportError` | Red, timeout o respuesta ilegible. `ambiguous: true` ⇒ **consulta antes de reenviar** |

**Sin reintentos ciegos.** Si el envío falla sin saber si el SRI lo procesó, `enviarYAutorizar` consulta la autorización por clave de acceso antes de decidir, y nunca reenvía por su cuenta.

## 🔍 Qué está verificado y qué no

**Verificado**
- ✅ Cédula, RUC y clave de acceso: vectores calculados de forma independiente.
- ✅ XML: los 6 comprobantes y sus secciones opcionales (también firmados) **validan contra los XSD oficiales del SRI** con `xmllint`.
- ✅ Firma: verificada con `xml-crypto` (implementación independiente); se detecta manipulación y *signature wrapping*. RSA-SHA1 según la ficha técnica §6.8.
- ✅ SOAP: las respuestas reales del ambiente de certificación (`celcer.sri.gob.ec`) se interpretan correctamente. Los códigos 43 y 70 se confirmaron en la ficha.

**No verificado — léelo antes de producción**
- ⚠️ **Sin autorización real de punta a punta.** Falta un RUC y un `.p12` registrados en el ambiente de pruebas. Con credenciales propias puedes cerrar esa brecha: ver [`docs/integracion.md`](docs/integracion.md). Hasta entonces `xml`, `signature` y `sri` son experimentales.
- ⚠️ **ICE e IRBPNR:** se validan los *códigos* (tabla 18), no las tarifas ni los valores: cambian por decreto y la tabla de la ficha es de 2023. Puedes sustituir el catálogo con `catalogos`.
- ⚠️ **Compensaciones y rubros de terceros** se emiten pero no entran en ningún total: la ficha no define su relación con `importeTotal`.
- ⚠️ **Leyenda «NEGOCIO POPULAR - RÉGIMEN RIMPE»:** la ficha v2.34 la admite, pero el XSD de 2022 no.
- ⚠️ **Existencia de cédula/RUC:** no hay API pública oficial del Registro Civil ni del SRI (el SRI valida al comprador al autorizar). El SDK valida formato y dígito verificador; conecta tu proveedor con `IdentityVerifier`/`validateAndVerify`. No se aceptan cédulas con tercer dígito 6 ni RUC de «formato cruzado» por falta de fuente oficial.
- ⚠️ La firma no valida la cadena de confianza ni la revocación del certificado.
- ⚠️ Fuera de alcance por ahora: versiones 1.0.0 de los comprobantes y 2.0.0 de retención; cálculo automático de totales (tú indicas códigos y valores).

> Este software se ofrece **sin garantía** (MIT). La responsabilidad tributaria sobre los comprobantes emitidos es del contribuyente.

## Seguridad

- Nunca subas `.p12`, claves privadas ni contraseñas. `.gitignore` ya los excluye.
- Las credenciales cargadas no se serializan ni se imprimen (`JSON.stringify`/`util.inspect` devuelven un marcador) y los errores no contienen contraseñas ni material de claves.
- TLS siempre verificado; `baseUrl` debe ser `https` y las redirecciones se rechazan.
- No registres XML completos en logs: contienen datos personales.
- ¿Encontraste una vulnerabilidad? Lee [SECURITY.md](SECURITY.md).

## Desarrollo

```bash
pnpm install
pnpm typecheck
pnpm test          # unitarias + validación XSD (requiere `xmllint`; si falta, esas pruebas se omiten)
pnpm build
```

Monorepo con pnpm workspaces y TypeScript estricto; pruebas con Vitest. La integración real contra el SRI está aislada (`vitest.integration.config.ts`) y nunca corre en CI. Guía completa en [CONTRIBUTING.md](CONTRIBUTING.md).

## Fuentes normativas

Ficha técnica «Comprobantes electrónicos – esquema offline» v2.34 y esquemas XSD publicados por el SRI en <https://www.sri.gob.ec/facturacion-electronica>. Los XSD usados en las pruebas viven en [`packages/xml/test/schemas`](packages/xml/test/schemas) con su atribución.

## Licencia

[MIT](LICENSE). Proyecto independiente: no está afiliado al Servicio de Rentas Internas.
