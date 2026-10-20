#!/usr/bin/env node
// Servidor local para revisar el sitio antes de publicarlo.
//   npm run ver   → sirve publicar/ en http://localhost:8080
//   npm run dev   → construye, sirve y reconstruye cada vez que cambiás algo en contenido/ o plantilla/
import http from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAIZ, carpetaSalida } from './lib/rutas.mjs';
const CARPETA = carpetaSalida(process.argv.includes('--vista-previa'));
const PUERTO = Number(process.env.PUERTO) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function resolver(rutaUrl) {
  let ruta;
  try {
    ruta = decodeURIComponent(rutaUrl);
  } catch {
    return null;
  }
  const absoluta = path.resolve(CARPETA, '.' + path.posix.normalize(ruta));
  if (absoluta !== CARPETA && !absoluta.startsWith(CARPETA + path.sep)) return null; // evita salir de la carpeta
  try {
    const info = await stat(absoluta);
    if (info.isDirectory()) {
      const indice = path.join(absoluta, 'index.html');
      await stat(indice);
      return indice;
    }
    return absoluta;
  } catch {
    return null;
  }
}

const servidor = http.createServer(async (pedido, respuesta) => {
  const url = new URL(pedido.url, 'http://localhost');
  if (url.pathname !== '/' && !url.pathname.endsWith('/') && !path.extname(url.pathname)) {
    respuesta.writeHead(301, { Location: url.pathname + '/' + url.search });
    respuesta.end();
    return;
  }
  let archivo = await resolver(url.pathname);
  let estado = 200;
  if (!archivo) {
    estado = 404;
    archivo = await resolver('/404.html');
  }
  if (!archivo) {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('No encontrado');
    return;
  }
  respuesta.writeHead(estado, {
    'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(archivo).pipe(respuesta);
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\n  Sitio en http://localhost:${PUERTO}  (Ctrl+C para cortar)\n`);
});

if (process.argv.includes('--vigilar')) {
  let temporizador = null;
  let construyendo = false;
  let pendiente = false;
  const construir = () => {
    if (construyendo) {
      pendiente = true;
      return;
    }
    construyendo = true;
    const proceso = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'construir.mjs')], { stdio: 'inherit' });
    proceso.on('exit', () => {
      construyendo = false;
      if (pendiente) {
        pendiente = false;
        construir();
      } else {
        console.log('  Listo. Recargá la página en el navegador.\n');
      }
    });
  };
  for (const carpeta of ['contenido', 'plantilla']) {
    watch(path.join(RAIZ, carpeta), { recursive: true }, () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(construir, 500);
    });
  }
  console.log('  Mirando cambios en contenido/ y plantilla/…');
}
