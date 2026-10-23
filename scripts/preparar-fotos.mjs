#!/usr/bin/env node
// Achica las fotos originales de un proyecto antes de subirlas, para que el repositorio no se infle.
// El sitio igual genera sus propias versiones livianas; esto solo reduce lo que se guarda en GitHub.
//   npm run fotos -- casa-las-lomas     → un proyecto
//   npm run fotos                       → todos los proyectos
// Primero numera las fotos que no tienen número (01, 02, 03…), en el orden de sus nombres
// (los de cámara, como LEO_0467, quedan en el orden en que se sacaron). Las que se llaman
// "main", "portada", "principal" o "tapa" van primero; las que dicen "render" conservan la marca.
// Después deja cada foto en 3000 px como máximo (lado largo), JPG calidad 88, girada según la cámara
// y sin datos de la cámara (GPS incluido). Las que ya son livianas no se tocan.
import { readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { RAIZ } from './lib/rutas.mjs';
import { existe, ordenNatural } from './lib/util.mjs';

const PROYECTOS = path.join(RAIZ, 'contenido', 'proyectos');
const LADO_MAXIMO = 3000;
const PESO_MAXIMO = 2.5 * 1024 * 1024; // por debajo de esto y con el tamaño correcto, no se toca
const ACHICABLES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

const pedido = process.argv[2]?.trim();
let carpetas;
if (pedido) {
  const carpeta = path.join(PROYECTOS, pedido);
  if (!(await existe(carpeta))) {
    console.error(`\nNo existe contenido/proyectos/${pedido}. Revisá el nombre de la carpeta.\n`);
    process.exit(1);
  }
  carpetas = [pedido];
} else {
  carpetas = (await readdir(PROYECTOS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
}

const NUMERADA = /^\d+/;
const PRINCIPAL = /\b(main|portada|principal|tapa)\b/i;

async function numerar(slug, carpeta) {
  const nombres = (await readdir(carpeta)).filter((n) => ACHICABLES.has(path.extname(n).toLowerCase()) || /\.hei[cf]$/i.test(n));
  const sinNumero = nombres.filter((n) => !NUMERADA.test(n));
  if (!sinNumero.length) return;
  let siguiente = Math.max(0, ...nombres.filter((n) => NUMERADA.test(n)).map((n) => parseInt(n, 10))) + 1;
  sinNumero.sort((a, b) => (PRINCIPAL.test(b) - PRINCIPAL.test(a)) || ordenNatural(a, b));
  const ancho = String(siguiente + sinNumero.length - 1).length < 2 ? 2 : String(siguiente + sinNumero.length - 1).length;
  console.log(`  Numerando ${sinNumero.length} foto(s) de ${slug}:`);
  for (const nombre of sinNumero) {
    const ext = path.extname(nombre).toLowerCase().replace('.jpeg', '.jpg');
    let nuevo;
    do {
      nuevo = String(siguiente++).padStart(ancho, '0') + (/render/i.test(nombre) ? '-render' : '') + ext;
    } while (await existe(path.join(carpeta, nuevo)));
    await rename(path.join(carpeta, nombre), path.join(carpeta, nuevo));
    console.log(`    ${nombre} → ${nuevo}`);
  }
  console.log('');
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
let antes = 0;
let despues = 0;
let cambiadas = 0;

for (const slug of carpetas) {
  const carpeta = path.join(PROYECTOS, slug);
  await numerar(slug, carpeta);
  for (const nombre of (await readdir(carpeta)).sort()) {
    const ext = path.extname(nombre).toLowerCase();
    const ruta = path.join(carpeta, nombre);
    if (ext === '.heic' || ext === '.heif') {
      console.log(`  ! ${slug}/${nombre}: las fotos HEIC del iPhone hay que exportarlas a JPG primero.`);
      continue;
    }
    if (!ACHICABLES.has(ext)) continue;

    const peso = (await stat(ruta)).size;
    let info;
    try {
      info = await sharp(ruta).metadata();
    } catch {
      console.log(`  ! ${slug}/${nombre}: no se pudo leer la imagen.`);
      continue;
    }
    const lado = Math.max(info.width || 0, info.height || 0);
    if (lado <= LADO_MAXIMO && peso <= PESO_MAXIMO) continue;

    // WEBP y PNG de planos o dibujos (poca variedad de tonos) quedan en su formato; el resto pasa a JPG.
    // Las fotos PNG con transparencia (suele quedar algún borde al editarlas) se pasan a JPG sobre blanco.
    let esDibujo = false;
    if (ext === '.png') esDibujo = (await sharp(ruta).stats()).entropy < 4.5;
    const mantenerFormato = ext === '.webp' || (ext === '.png' && esDibujo);
    const extNueva = mantenerFormato ? ext : '.jpg';
    const destino = path.join(carpeta, path.basename(nombre, path.extname(nombre)) + extNueva);
    const mismoArchivo = destino.toLowerCase() === ruta.toLowerCase(); // Windows no distingue .JPG de .jpg
    if (!mismoArchivo && (await existe(destino))) {
      console.log(`  ! ${slug}/${nombre}: ya existe ${path.basename(destino)}; la dejo como está.`);
      continue;
    }

    let imagen = sharp(ruta).rotate().resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true });
    if (extNueva === '.jpg') imagen = imagen.flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' });
    else if (extNueva === '.webp') imagen = imagen.webp({ quality: 90 });
    else imagen = imagen.png({ compressionLevel: 9 });

    const temporal = destino + '.tmp';
    await imagen.toFile(temporal);
    const nuevoPeso = (await stat(temporal)).size;
    // Si no hacía falta achicarla y la ganancia es poca, queda el original (evita recomprimir de más).
    if (lado <= LADO_MAXIMO && nuevoPeso > peso * 0.75) {
      await unlink(temporal);
      continue;
    }
    if (destino !== ruta) await unlink(ruta);
    await rename(temporal, destino);
    antes += peso;
    despues += nuevoPeso;
    cambiadas++;
    const renombre = destino !== ruta ? ` → ${path.basename(destino)}` : '';
    console.log(`  ✔ ${slug}/${nombre}${renombre}: ${mb(peso)} → ${mb(nuevoPeso)}`);
  }
}

if (!cambiadas) console.log('\n  Todas las fotos ya estaban livianas. No cambié nada.\n');
else console.log(`\n  Listo: ${cambiadas} foto(s), de ${mb(antes)} a ${mb(despues)}.\n  Si cambió alguna extensión (por ejemplo .png → .jpg), revisá "portada:" en proyecto.txt.\n`);
