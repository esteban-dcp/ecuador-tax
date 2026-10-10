# Ecuador Tax SDK — Plan de proyecto

## 1. Visión general

**Ecuador Tax SDK** es un proyecto open source cuyo objetivo es proporcionar un conjunto de herramientas modernas, modulares y mantenibles para integrar funcionalidades tributarias ecuatorianas en aplicaciones de software.

El proyecto estará orientado principalmente a desarrolladores de software, empresas tecnológicas y equipos que construyen sistemas de facturación, POS, ERP, contabilidad y gestión empresarial.

La idea es evitar que cada desarrollador tenga que implementar por separado la validación de identificaciones, la generación de claves de acceso, la construcción de XML, la firma electrónica y la comunicación con los servicios del Servicio de Rentas Internas (SRI).

El proyecto no será un SaaS, una plataforma comercial de facturación ni un ERP. Será una biblioteca de código reutilizable que cualquier persona pueda instalar, ejecutar y mantener en su propia infraestructura, sin depender de servidores operados por los mantenedores.

### Objetivos principales

- Crear una implementación TypeScript coherente de las funcionalidades tributarias ecuatorianas.
- Facilitar la integración con el SRI mediante interfaces programáticas claras.
- Proporcionar módulos independientes que puedan utilizarse por separado.
- Priorizar la corrección tributaria, la seguridad, la interoperabilidad y las pruebas automatizadas.
- Mantener el proyecto accesible para contribuciones de la comunidad.
- Publicar bajo licencia MIT y fomentar su adopción dentro y fuera de Ecuador.

## 2. Alcance del proyecto

El proyecto tendrá una visión amplia, pero su desarrollo inicial deberá limitarse a un alcance realista de aproximadamente ocho semanas.

La arquitectura podrá contemplar funcionalidades futuras sin que todas deban implementarse antes del primer lanzamiento estable.

### 2.1. Módulos principales

**`@ecuador-tax/core`**

Núcleo compartido del ecosistema.

Responsabilidades:
- Tipos y modelos comunes.
- Errores tipados y estructura uniforme de resultados.
- Utilidades compartidas para fechas, importes y datos tributarios.
- Interfaces comunes para documentos y operaciones.
- Configuración y contratos compartidos entre módulos.

Debe evitar convertirse en un módulo con dependencias innecesarias o reglas específicas que deberían pertenecer a otros paquetes.

**`@ecuador-tax/identification`**

Herramientas de identificación ecuatoriana.

Responsabilidades:
- Validación de formatos de cédula y RUC.
- Verificación de dígitos y reglas de validación correspondientes.
- Identificación de formatos inválidos con errores claros.
- Pruebas con casos válidos, inválidos y límites conocidos.

Validar el formato de una identificación no debe confundirse con verificar su existencia, vigencia o estado ante una fuente oficial.

**`@ecuador-tax/access-key`**

Generación y validación de claves de acceso para comprobantes electrónicos.

Responsabilidades:
- Construcción de claves conforme a las reglas oficiales aplicables.
- Validación de longitud, estructura y dígitos verificadores.
- Tratamiento de los tipos de comprobante, códigos y demás campos pertinentes.
- Pruebas automatizadas con vectores de referencia.

No se deben inventar reglas ni asumir que todos los campos pueden validarse únicamente por su formato.

**`@ecuador-tax/xml`**

Generación y validación de XML tributarios.

Responsabilidades:
- Modelos tipados para los documentos soportados.
- Serialización XML determinista cuando corresponda.
- Validación estructural y contra los esquemas XSD oficiales aplicables.
- Tratamiento correcto de caracteres especiales, espacios, decimales y fechas.
- Errores de validación comprensibles y localizables.
- Fixtures de documentos válidos e inválidos.

La implementación deberá basarse en las fichas técnicas y esquemas oficiales vigentes para cada tipo de documento soportado.

**`@ecuador-tax/signature`**

Herramientas para firma electrónica de comprobantes.

Responsabilidades:
- Firma compatible con los requisitos técnicos aplicables del SRI.
- Soporte para certificados y claves privadas en los formatos admitidos.
- Validación de certificados y manejo de errores criptográficos.
- Pruebas de integridad y verificación de firmas.
- Documentación de compatibilidad y limitaciones.

Los certificados y las claves privadas nunca deben incluirse en el repositorio, registrarse en logs ni exponerse en mensajes de error. El SDK no debe almacenar secretos de manera persistente por defecto.

**`@ecuador-tax/sri`**

Integración con los servicios web oficiales del SRI.

Responsabilidades:
- Comunicación SOAP con los servicios de recepción y autorización.
- Configuración explícita de los ambientes de pruebas y producción.
- Modelado tipado de solicitudes y respuestas.
- Interpretación de estados, rechazos y mensajes de error.
- Consultas de autorización y tratamiento de procesos asíncronos.
- Timeouts, cancelación cuando sea posible y errores de transporte diferenciados de los rechazos tributarios.

Las operaciones deberán evitar reintentos ciegos que puedan provocar duplicaciones o resultados ambiguos. Cuando una solicitud falle sin que pueda determinarse si fue procesada, el SDK deberá permitir recuperar o consultar su estado antes de repetirla.

**`@ecuador-tax/testing`**

Herramientas compartidas para pruebas y desarrollo.

Responsabilidades:
- Fixtures sintéticos y anonimizados.
- Respuestas simuladas de los servicios del SRI.
- Casos de prueba reutilizables.
- Escenarios de rechazo, timeout, duplicación y recuperación.
- Utilidades para probar las integraciones sin depender de servicios externos en cada ejecución.

Este paquete complementará las pruebas reales contra el ambiente de certificación, pero no las sustituirá.

### 2.2. Tipos de comprobantes

La arquitectura deberá permitir trabajar con los comprobantes electrónicos contemplados por la documentación oficial, incluidos los siguientes cuando corresponda:

- Facturas.
- Liquidaciones de compra de bienes y prestación de servicios.
- Notas de crédito.
- Notas de débito.
- Comprobantes de retención.
- Guías de remisión.

La implementación de cada tipo deberá verificarse individualmente. No se considerará que un comprobante está soportado únicamente porque exista su interfaz TypeScript: deberá generar XML correcto, superar las validaciones aplicables y disponer de pruebas documentadas.

## 3. Arquitectura y tecnología

El proyecto utilizará TypeScript como lenguaje principal y estará diseñado prioritariamente para Node.js.

### Tecnologías previstas

- TypeScript con configuración estricta.
- pnpm para la gestión de dependencias y el workspace.
- Turborepo únicamente si aporta valor real al proceso de compilación.
- Vitest para pruebas automatizadas.
- GitHub Actions para integración continua.
- npm para la distribución de paquetes.
- GitHub para el código, issues, documentación y releases.

Las tecnologías definitivas deberán elegirse teniendo en cuenta su estabilidad, compatibilidad y coste de mantenimiento.

### Principios arquitectónicos

1. **Modularidad:** cada paquete tendrá una responsabilidad claramente definida.
2. **Bajo acoplamiento:** los módulos tributarios no dependerán innecesariamente del transporte SOAP o de un framework web.
3. **Interoperabilidad:** las interfaces públicas serán utilizables desde aplicaciones Node.js sin exigir NestJS, Express ni otro framework específico.
4. **Dependencias mínimas:** no incorporar bibliotecas sin una justificación técnica.
5. **Seguridad por defecto:** proteger certificados, claves privadas y datos tributarios.
6. **Errores explícitos:** diferenciar validaciones fallidas, errores de configuración, problemas criptográficos, rechazos del SRI y fallos de red.
7. **Compatibilidad documentada:** especificar las versiones de Node.js, TypeScript y dependencias soportadas.
8. **Ejecución local:** ninguna funcionalidad esencial deberá depender de una API privada o de infraestructura administrada por el proyecto.

## 4. Calidad, pruebas y cumplimiento normativo

La precisión será más importante que la cantidad de funcionalidades.

Antes de implementar cada componente se deberán consultar las fuentes oficiales pertinentes, incluyendo las fichas técnicas, esquemas XML, normativa y documentación de los servicios web del SRI.

Cada regla relevante deberá vincularse, cuando sea posible, con su fuente, versión y pruebas asociadas.

### Pruebas obligatorias

- Pruebas unitarias de validadores y utilidades.
- Pruebas de generación y validación XML.
- Pruebas de firma y verificación criptográfica.
- Pruebas de serialización y compatibilidad.
- Pruebas de errores de transporte y respuestas del SRI.
- Pruebas de integración de extremo a extremo en el ambiente de certificación.
- Pruebas de regresión para evitar que nuevas versiones rompan comportamientos previamente validados.

Las pruebas unitarias y la integración continua no deberán depender de credenciales tributarias reales.

Las pruebas de integración con el SRI podrán ejecutarse por separado y deberán documentar los requisitos necesarios para reproducirlas.

No se afirmará compatibilidad completa con una ficha técnica, un tipo de comprobante o un flujo de autorización sin evidencia verificable.

## 5. Seguridad

El SDK deberá adoptar prácticas de seguridad apropiadas para una biblioteca que maneja documentos tributarios y material criptográfico.

- No incluir certificados, claves privadas, contraseñas ni datos personales reales en el repositorio.
- Evitar registrar XML completos, credenciales o información sensible en logs.
- No desactivar verificaciones TLS para facilitar conexiones.
- Documentar las implicaciones de seguridad de cada método que maneje certificados.
- Mantener dependencias actualizadas y revisar vulnerabilidades.
- Proporcionar ejemplos seguros de configuración.
- Evitar mecanismos de almacenamiento persistente de secretos por defecto.

Los ejemplos y fixtures publicados deberán utilizar datos sintéticos o estar debidamente anonimizados.

## 6. Licencia y distribución

El proyecto se publicará bajo licencia MIT.

Los paquetes públicos utilizarán el ámbito `@ecuador-tax`, sujeto a disponibilidad en npm.

La distribución deberá incluir:
- Versionado semántico.
- Changelog por versión.
- Releases identificables.
- Documentación de instalación y actualización.
- Declaración de compatibilidad y limitaciones.
- Información de licencias de dependencias y atribuciones aplicables.

Antes de reutilizar código de otros proyectos open source se deberá revisar su licencia y respetar sus condiciones. MIT será la licencia del código propio, no una justificación para relicenciar código ajeno sin autorización.

## 7. Documentación y experiencia de desarrollo

La documentación deberá estar disponible en español y, progresivamente, en inglés.

Deberá incluir:
- Instalación de cada paquete.
- Ejemplos mínimos y ejemplos de integración.
- Referencia de la API pública.
- Requisitos y limitaciones de cada módulo.
- Guías de configuración de certificados.
- Uso de los ambientes del SRI.
- Interpretación de errores frecuentes.
- Procedimientos para ejecutar las pruebas.
- Guía de contribución y reporte de errores.

El objetivo es que un desarrollador pueda integrar una funcionalidad concreta sin tener que comprender todo el repositorio.

## 8. Plan de trabajo: ocho semanas

**Semana 1 — Investigación y arquitectura**

Auditar proyectos existentes, revisar sus licencias y actividad, estudiar la documentación oficial, definir el alcance de la primera versión y establecer la estructura del monorepo.

**Semanas 2 y 3 — Núcleo y utilidades**

Implementar el núcleo, los validadores de identificaciones y las claves de acceso. Añadir pruebas, tipos públicos, documentación inicial y CI.

**Semanas 4 y 5 — XML y firma**

Implementar los documentos prioritarios, validación mediante XSD y firma electrónica. Probar las funcionalidades con fixtures verificables y documentar las limitaciones.

**Semana 6 — Servicios del SRI**

Implementar la comunicación SOAP, la recepción, las consultas de autorización y el tratamiento de errores y timeouts.

**Semana 7 — Integración completa**

Ejecutar pruebas de extremo a extremo en el ambiente de certificación. Corregir fallos, comprobar el comportamiento ante rechazos y verificar la recuperación de operaciones ambiguas.

**Semana 8 — Estabilización y publicación**

Completar la documentación, revisar seguridad y dependencias, verificar las licencias, publicar los paquetes que hayan alcanzado el nivel de calidad necesario y preparar el primer release.

El calendario es una meta de planificación. Si un componente crítico no supera las pruebas, deberá quedar fuera de la versión estable o publicarse explícitamente como experimental.

## 9. Criterios de finalización de la primera versión estable

La primera versión se considerará lista únicamente cuando:

- Los paquetes publicados tengan interfaces documentadas y responsabilidades claras.
- Las funcionalidades anunciadas estén implementadas y probadas.
- Los XML generados por los comprobantes soportados superen las validaciones correspondientes.
- La firma electrónica se haya verificado con pruebas reproducibles.
- Se haya completado un flujo de integración real en el ambiente de certificación para los tipos de comprobante declarados como soportados.
- Los errores y las operaciones de recepción y autorización estén documentados.
- Existan CI, instrucciones de instalación, ejemplos y changelog.
- Se hayan revisado las dependencias, la seguridad y las licencias.
- Las limitaciones conocidas sean públicas y explícitas.

No será obligatorio que todos los tipos de comprobante o módulos futuros estén completos para publicar una primera versión útil.

## 10. Mantenimiento y evolución

El proyecto deberá diseñarse para que su mantenimiento sea viable para una comunidad pequeña.

- Mantener una política clara de versiones y compatibilidad.
- Automatizar pruebas y verificaciones de calidad.
- Aceptar contribuciones mediante pull requests revisables.
- Utilizar issues y plantillas para facilitar reportes reproducibles.
- Documentar los cambios normativos y su impacto en las versiones.
- Evitar promesas de soporte permanente o tiempos de respuesta que no puedan garantizarse.
- No incorporar funcionalidades por cantidad o por apariencia de completitud.

Después del primer lanzamiento podrán añadirse nuevos comprobantes, reglas tributarias, adaptadores o integraciones según las necesidades verificadas de los usuarios.

## 11. Principio rector

Ecuador Tax SDK deberá priorizar la corrección, la transparencia y la utilidad práctica sobre la cantidad de funcionalidades.

El objetivo no es crear una implementación apresurada de toda la normativa tributaria ecuatoriana, sino construir una base técnica confiable, extensible y abierta que otros desarrolladores puedan utilizar, auditar y mejorar.

**Meta final:** publicar en un máximo aproximado de ocho semanas una primera versión open source útil, documentada y verificable, con licencia MIT, sin SaaS ni infraestructura obligatoria y con una arquitectura preparada para evolucionar de forma sostenible.
