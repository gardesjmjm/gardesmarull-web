#!/usr/bin/env node
// Crea la carpeta y la ficha de un proyecto nuevo.
//   npm run nuevo -- "Casa Las Lomas"
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugificar, existe } from './lib/util.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTOS = path.join(RAIZ, 'contenido', 'proyectos');

const nombre = process.argv.slice(2).join(' ').trim();
if (!nombre) {
  console.error('\nUso: npm run nuevo -- "Nombre del proyecto"\n');
  process.exit(1);
}
const slug = slugificar(nombre);
if (!slug) {
  console.error('\nEl nombre tiene que tener al menos una letra o un número.\n');
  process.exit(1);
}
const carpeta = path.join(PROYECTOS, slug);
if (await existe(carpeta)) {
  console.error(`\nYa existe contenido/proyectos/${slug}. Elegí otro nombre o editá esa carpeta.\n`);
  process.exit(1);
}

// Queda primero en el sitio: orden menor que el de todos los demás.
let menor = 10;
for (const d of await readdir(PROYECTOS, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  try {
    const texto = await readFile(path.join(PROYECTOS, d.name, 'proyecto.txt'), 'utf8');
    const m = texto.match(/^\s*orden\s*:\s*(-?\d+(?:\.\d+)?)/im);
    if (m) menor = Math.min(menor, Number(m[1]));
  } catch {
    /* carpeta sin ficha */
  }
}
const sitio = JSON.parse(await readFile(path.join(RAIZ, 'contenido', 'sitio.json'), 'utf8'));

const ficha = `# Ficha del proyecto. Las líneas que empiezan con # no se publican.
# Completá lo que sepas: los datos vacíos no se muestran en el sitio.

nombre: ${nombre}
# categoria: una de ${sitio.categorias.join(', ')}
categoria: ${sitio.categorias[0]}
ubicacion:
año:
superficie:
rol:
estado:
desarrollo:
fotografia:

# Orden en el sitio (más chico = más arriba) y si aparece en el inicio (si / no).
orden: ${menor - 10}
destacado: si
# portada: 01.jpg   (si no se indica, se usa la primera foto)

---
# Debajo de la línea de guiones va el texto del proyecto (opcional, 2 o 3 líneas).
`;

await mkdir(carpeta, { recursive: true });
await writeFile(path.join(carpeta, 'proyecto.txt'), ficha, 'utf8');

console.log(`
✔ Creé contenido/proyectos/${slug}/proyecto.txt

Ahora:
  1. Copiá las fotos en esa carpeta, numeradas: 01.jpg, 02.jpg, 03.jpg…
     (los renders con "render" en el nombre: 08-render.jpg; las de Enscape también)
  2. Completá los datos en proyecto.txt.
  3. Revisalo en tu compu:   npm run dev   → http://localhost:8080
  4. Publicalo:  git add -A; if ($?) { git commit -m "Nuevo proyecto: ${nombre.replace(/"/g, '')}" }; if ($?) { git push }
`);
