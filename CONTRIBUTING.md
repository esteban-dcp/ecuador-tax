# Contribuir

¡Gracias por querer mejorar el SDK! La precisión tributaria importa más que la cantidad de funciones.

## Flujo

1. Abre un issue antes de un cambio grande. Para reglas tributarias, cita la fuente (ficha técnica v2.34, anexo/tabla, o XSD).
2. `pnpm install`, haz tu cambio y ejecuta `pnpm typecheck && pnpm test && pnpm build`.
3. Toda regla nueva lleva una prueba; los cambios en XML se validan contra el XSD oficial (`packages/xml/test/schemas`).
4. Abre un pull request pequeño y descriptivo.

## Reglas del proyecto

- **Nada de datos reales** en el repo: ni certificados, claves, contraseñas, RUC o cédulas de personas. Usa los fixtures sintéticos de `@ecuador-tax/testing`.
- **Dependencias mínimas:** justifica cada una nueva.
- **No afirmes compatibilidad sin evidencia** (prueba, XSD o autorización en el ambiente de certificación).
- Si copias código de otro proyecto, revisa su licencia primero.
- Las pruebas de integración con el SRI son opcionales y nunca corren en CI (`docs/integracion.md`).

## Documentos oficiales

La ficha técnica y los XSD se descargan de <https://www.sri.gob.ec/facturacion-electronica>. La carpeta `docs/official-sri/` está ignorada por git.
