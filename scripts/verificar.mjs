#!/usr/bin/env node
// Revisa el sitio construido antes de publicarlo: enlaces e imágenes rotas, títulos, descripciones,
// textos alternativos y destinos de las redirecciones. Si encuentra errores, corta la publicación.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { carpetaSalida } from './lib/rutas.mjs';
const CARPETA = carpetaSalida(process.argv.includes('--vista-previa'));
const errores = [];
const avisos = [];

async function listar(dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await listar(ruta)));
    else salida.push(ruta);
  }
  return salida;
}

async function existeDestino(desdeArchivo, ref) {
  const limpio = ref.split('#')[0].split('?')[0];
  if (!limpio) return true;
  let destino = limpio.startsWith('/') ? path.join(CARPETA, limpio) : path.join(path.dirname(desdeArchivo), limpio);
  try {
    destino = decodeURIComponent(destino);
  } catch {
    return false;
  }
  if (limpio.endsWith('/')) destino = path.join(destino, 'index.html');
  try {
    const info = await stat(destino);
    if (info.isDirectory()) await stat(path.join(destino, 'index.html'));
    return true;
  } catch {
    return false;
  }
}

const esExterna = (ref) => /^(https?:|mailto:|tel:|data:|#|\/\/)/.test(ref);

const archivos = await listar(CARPETA);
const html = archivos.filter((a) => a.endsWith('.html'));
const titulos = new Map();

for (const archivo of html) {
  const nombre = path.relative(CARPETA, archivo);
  const texto = await readFile(archivo, 'utf8');
  const titulo = texto.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!titulo) errores.push(`${nombre}: falta <title>`);
  else if (titulos.has(titulo)) errores.push(`${nombre}: el título «${titulo}» se repite en ${titulos.get(titulo)}`);
  else titulos.set(titulo, nombre);
  if (!/<meta name="description" content="[^"]{20,}"/.test(texto)) errores.push(`${nombre}: falta la descripción (meta description)`);
  const h1 = (texto.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errores.push(`${nombre}: tiene ${h1} títulos <h1> (debe tener 1)`);

  for (const m of texto.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) errores.push(`${nombre}: imagen sin texto alternativo → ${m[0].slice(0, 80)}`);
  }
  const refs = new Set();
  for (const m of texto.matchAll(/\b(?:href|src)="([^"]+)"/g)) refs.add(m[1].replace(/&amp;/g, '&'));
  for (const m of texto.matchAll(/\b(?:srcset|imagesrcset|data-webp|data-avif)="([^"]+)"/g)) {
    for (const parte of m[1].split(',')) refs.add(parte.trim().split(/\s+/)[0]);
  }
  for (const ref of refs) {
    if (esExterna(ref)) continue;
    if (!(await existeDestino(archivo, ref))) errores.push(`${nombre}: enlace o archivo roto → ${ref}`);
  }
}

// Destinos de las redirecciones del .htaccess
const htaccess = path.join(CARPETA, '.htaccess');
try {
  const texto = await readFile(htaccess, 'utf8');
  for (const m of texto.matchAll(/^RewriteRule \S+ (\/\S*) \[R=301/gm)) {
    if (!(await existeDestino(htaccess, m[1]))) errores.push(`.htaccess: la redirección apunta a algo que no existe → ${m[1]}`);
  }
} catch {
  if (!CARPETA.endsWith('vista-previa')) errores.push('Falta el archivo .htaccess');
}

// Peso de la página de inicio (HTML + CSS + JS + fuentes)
const inicio = path.join(CARPETA, 'index.html');
try {
  const texto = await readFile(inicio, 'utf8');
  let total = (await stat(inicio)).size;
  for (const m of texto.matchAll(/<(?:link rel="(?:stylesheet|preload)"[^>]*href|script src)="([^"]+\.(?:css|js|woff2))"/g)) {
    try {
      total += (await stat(path.join(CARPETA, m[1].replace(/^\//, '')))).size;
    } catch {
      /* ya informado arriba */
    }
  }
  console.log(`  Inicio: ${(total / 1024).toFixed(0)} KB de HTML, CSS, JS y tipografía (sin contar fotos).`);
  if (total > 250 * 1024) avisos.push('La página de inicio pesa más de 250 KB sin fotos.');
} catch {
  errores.push('Falta index.html');
}

console.log(`  Revisé ${html.length} páginas y ${archivos.length} archivos.`);
for (const a of avisos) console.log(`  • Aviso: ${a}`);
if (errores.length) {
  console.error(`\n✖ ${errores.length} problema(s):`);
  for (const e of errores.slice(0, 60)) console.error(`  • ${e}`);
  process.exit(1);
}
console.log('✔ Todo en orden.');
