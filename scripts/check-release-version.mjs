// Comprueba que la etiqueta (p. ej. v0.2.0) coincide con la versión de TODOS los paquetes.
import { readdirSync, readFileSync } from 'node:fs';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? '';
const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`La etiqueta "${tag}" no tiene formato vMAJOR.MINOR.PATCH`);
  process.exit(1);
}
const bad = readdirSync('packages')
  .map((d) => JSON.parse(readFileSync(`packages/${d}/package.json`, 'utf8')))
  .filter((p) => p.version !== version)
  .map((p) => `${p.name}@${p.version}`);
if (bad.length) {
  console.error(`Estos paquetes no están en la versión ${version}: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`OK: todos los paquetes están en ${version}`);
