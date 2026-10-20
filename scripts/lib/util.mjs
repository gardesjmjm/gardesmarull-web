// Utilidades compartidas por los scripts del sitio.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

/** Escapa texto para insertarlo en HTML (contenido y atributos). */
export const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Hash corto (hex) para nombres de archivo con caché permanente. */
export const hashCorto = (datos, largo = 8) => createHash('sha256').update(datos).digest('hex').slice(0, largo);

export const sinAcentos = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Casa del Golf" → "casa-del-golf" */
export const slugificar = (texto) =>
  sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Orden natural en castellano: "2.jpg" antes que "10.jpg". */
export const ordenNatural = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export async function escribir(ruta, contenido) {
  await mkdir(path.dirname(ruta), { recursive: true });
  await writeFile(ruta, contenido);
}

export async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

/** Error de contenido: se muestra al usuario sin traza técnica. */
export class ErrorContenido extends Error {}

/** Ejecuta tareas asíncronas con un máximo de N en paralelo. */
export async function enParalelo(items, limite, tarea) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await tarea(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

/** JSON seguro para incrustar dentro de <script type="application/ld+json">. */
export const jsonParaScript = (objeto) => JSON.stringify(objeto).replace(/</g, '\\u003c');

/** Valida un encuadre tipo "50% 30%" (se usa en CSS, así que se valida estrictamente). */
export const encuadreValido = (valor) => /^(100|\d{1,2})% (100|\d{1,2})%$/.test(String(valor || '').trim());
