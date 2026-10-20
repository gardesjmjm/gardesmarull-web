// Dónde se guardan las carpetas que se regeneran (publicar, vista-previa, caché de imágenes).
// Si el proyecto está dentro de Dropbox, van afuera (en %LOCALAPPDATA%\gardesmarull-web o ~/.gardesmarull-web)
// para que Dropbox no sincronice cientos de archivos en cada compilación.
// Se puede forzar otra carpeta con la variable de entorno GM_CARPETA_TRABAJO.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function estaEnDropbox(carpeta) {
  let actual = carpeta;
  while (true) {
    if (/dropbox/i.test(path.basename(actual)) || existsSync(path.join(actual, '.dropbox')) || existsSync(path.join(actual, '.dropbox.cache'))) return true;
    const padre = path.dirname(actual);
    if (padre === actual) return false;
    actual = padre;
  }
}

function carpetaDeTrabajo() {
  if (process.env.GM_CARPETA_TRABAJO) return path.resolve(process.env.GM_CARPETA_TRABAJO);
  if (!process.env.CI && estaEnDropbox(RAIZ)) {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
    return path.join(base, 'gardesmarull-web');
  }
  return RAIZ;
}

export const TRABAJO = carpetaDeTrabajo();
export const carpetaSalida = (vistaPrevia) => path.join(TRABAJO, vistaPrevia ? 'vista-previa' : 'publicar');
export const CACHE = path.join(TRABAJO, '.cache', 'imagenes');
