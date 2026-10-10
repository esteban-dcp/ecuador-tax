# Publicar versiones en npm

Las versiones se publican desde GitHub Actions (`.github/workflows/release.yml`) con **provenance**: npm muestra
en cada paquete que fue construido desde un commit concreto de este repositorio, sin OTP manual.

## Configuración única (una sola vez)

Elige **una** de las dos formas de autenticar:

### A. Trusted publishing (recomendada, sin secretos)
En npmjs.com, para **cada uno de los 7 paquetes** → *Settings* → *Trusted Publisher* → *GitHub Actions*:

| Campo | Valor |
|---|---|
| Organization or user | `esteban-dcp` |
| Repository | `ecuador-tax` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

### B. Token de automatización
Crea un *granular access token* con permiso de escritura sobre `@ecuador-tax/*` que no exija 2FA
para publicar, y guárdalo como secreto `NPM_TOKEN` del repositorio.

### Aprobación manual (opcional pero recomendada)
En GitHub → *Settings* → *Environments* → crea el entorno `npm` y añade *Required reviewers*: nada se publica sin que lo apruebes.

## Publicar una versión

1. Sube la versión en los 7 `package.json` (todas iguales) y anota los cambios en `CHANGELOG.md`.
2. Haz commit y espera el CI en verde.
3. `git tag v0.2.0 && git push origin v0.2.0`
4. Aprueba el despliegue en la pestaña *Actions* (si activaste el entorno `npm`).

El workflow verifica que la etiqueta coincida con la versión de todos los paquetes, ejecuta typecheck, build y tests,
y publica en orden de dependencias. Es re-ejecutable: omite las versiones que ya existen.

## Probar sin publicar
```bash
pnpm build && DRY_RUN=1 ./scripts/publish-workspace.sh
```
