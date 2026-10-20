// Lectura y validación del contenido: contenido/sitio.json y contenido/proyectos/*/proyecto.txt
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ErrorContenido, ordenNatural, sinAcentos, slugificar, encuadreValido, existe } from './util.mjs';

export const EXTENSIONES_IMAGEN = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);

// Claves admitidas en proyecto.txt (sin acentos, en minúscula) → nombre interno.
const CLAVES = {
  nombre: 'nombre',
  categoria: 'categoria',
  ubicacion: 'ubicacion',
  ano: 'ano',
  anio: 'ano',
  superficie: 'superficie',
  rol: 'rol',
  estado: 'estado',
  desarrollo: 'desarrollo',
  fotografia: 'fotografia',
  orden: 'orden',
  destacado: 'destacado',
  portada: 'portada',
  encuadre: 'encuadre',
  columna: 'columna',
  renders: 'renders',
};

const normalizarClave = (clave) => sinAcentos(clave).trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Lee un proyecto.txt: líneas "clave: valor", y después de una línea "---" el texto descriptivo. */
export function leerFicha(texto, archivo, avisos) {
  const lineas = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const datos = {};
  const descripcion = [];
  let enTexto = false;
  lineas.forEach((linea, n) => {
    const limpia = linea.trim();
    if (enTexto) {
      if (!limpia.startsWith('#')) descripcion.push(linea);
      return;
    }
    if (/^-{3,}$/.test(limpia)) {
      enTexto = true;
      return;
    }
    if (!limpia || limpia.startsWith('#')) return;
    const i = limpia.indexOf(':');
    if (i < 1) throw new ErrorContenido(`${archivo}, línea ${n + 1}: falta el formato "clave: valor" → «${limpia}»`);
    const clave = CLAVES[normalizarClave(limpia.slice(0, i))];
    if (!clave) {
      avisos.push(`${archivo}, línea ${n + 1}: no reconozco «${limpia.slice(0, i).trim()}», la ignoro.`);
      return;
    }
    datos[clave] = limpia.slice(i + 1).trim();
  });
  // Párrafos separados por una línea en blanco.
  datos.parrafos = descripcion
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return datos;
}

const siNo = (valor, porDefecto) => {
  if (valor === undefined || valor === '') return porDefecto;
  return /^(si|sí|s|yes|true|1)$/i.test(valor.trim());
};

/** Interpreta el nombre de una foto: "03-render-patio.jpg" → { numero: 3, esRender: true, leyenda: "Patio" } */
export function interpretarNombreFoto(archivo) {
  const base = path.parse(archivo).name;
  const esRender = /render/i.test(base);
  const texto = base
    .replace(/^\d+/, '')
    .replace(/render/gi, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const leyenda = texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  return { esRender, leyenda };
}

export async function leerSitio(dirContenido) {
  const archivo = path.join(dirContenido, 'sitio.json');
  let sitio;
  try {
    sitio = JSON.parse(await readFile(archivo, 'utf8'));
  } catch (error) {
    throw new ErrorContenido(`No pude leer contenido/sitio.json: ${error.message}`);
  }
  for (const campo of ['nombre', 'url', 'email', 'whatsapp', 'categorias']) {
    if (!sitio[campo]) throw new ErrorContenido(`Falta "${campo}" en contenido/sitio.json`);
  }
  sitio.url = sitio.url.replace(/\/+$/, '');
  sitio.categorias = sitio.categorias.map((nombre) => ({ nombre, slug: slugificar(nombre) }));
  sitio.portadas = (sitio.portadas || []).map((p) => {
    if (p.encuadre && !encuadreValido(p.encuadre)) throw new ErrorContenido(`Encuadre inválido en portadas de sitio.json: «${p.encuadre}». Usá el formato "50% 30%".`);
    return p;
  });
  if (sitio.formulario_url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(sitio.formulario_url)) {
    throw new ErrorContenido('formulario_url en sitio.json debe ser la URL de la aplicación web de Apps Script (https://script.google.com/macros/s/…/exec) o quedar vacío.');
  }
  if (sitio.google_analytics && !/^G-[A-Z0-9]{4,12}$/.test(sitio.google_analytics)) {
    throw new ErrorContenido('google_analytics en sitio.json debe ser un ID tipo G-XXXXXXX o quedar vacío.');
  }
  return sitio;
}

export async function leerProyectos(dirContenido, sitio, avisos) {
  const dirProyectos = path.join(dirContenido, 'proyectos');
  const carpetas = (await readdir(dirProyectos, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort(ordenNatural);

  const proyectos = [];
  for (const carpeta of carpetas) {
    const dir = path.join(dirProyectos, carpeta);
    const relativo = `contenido/proyectos/${carpeta}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(carpeta)) {
      throw new ErrorContenido(`La carpeta «${relativo}» tiene un nombre no válido. Usá minúsculas, números y guiones (por ejemplo: casa-del-golf).`);
    }
    const archivoFicha = path.join(dir, 'proyecto.txt');
    if (!(await existe(archivoFicha))) {
      throw new ErrorContenido(`Falta ${relativo}/proyecto.txt (podés crearlo con: npm run nuevo -- "Nombre del proyecto")`);
    }
    const ficha = leerFicha(await readFile(archivoFicha, 'utf8'), `${relativo}/proyecto.txt`, avisos);
    if (!ficha.nombre) throw new ErrorContenido(`${relativo}/proyecto.txt: falta "nombre:"`);

    const archivos = (await readdir(dir)).sort(ordenNatural);
    const fotos = [];
    for (const archivo of archivos) {
      if (archivo.startsWith('_') || archivo.startsWith('.')) continue;
      const ext = path.extname(archivo).toLowerCase();
      if (ext === '.heic' || ext === '.heif') {
        throw new ErrorContenido(`${relativo}/${archivo}: el formato HEIC (iPhone) no se puede procesar. Exportala como JPG.`);
      }
      if (!EXTENSIONES_IMAGEN.has(ext)) continue;
      const info = await stat(path.join(dir, archivo));
      if (info.size > 40 * 1024 * 1024) throw new ErrorContenido(`${relativo}/${archivo} pesa más de 40 MB. Reducila antes de subirla.`);
      fotos.push({ archivo, ruta: path.join(dir, archivo), ...interpretarNombreFoto(archivo) });
    }
    if (!fotos.length) {
      avisos.push(`${relativo} todavía no tiene fotos: no se publica hasta que las agregues.`);
      continue;
    }
    // "renders: si" en la ficha marca todas las imágenes como renders, sin renombrar archivos.
    if (siNo(ficha.renders, false)) fotos.forEach((f) => (f.esRender = true));

    // Fotos primero, renders después (cada grupo conserva el orden de los nombres).
    const ordenadas = [...fotos.filter((f) => !f.esRender), ...fotos.filter((f) => f.esRender)];

    let categoria = sitio.categorias.find((c) => c.slug === slugificar(ficha.categoria || ''));
    if (!categoria) {
      avisos.push(`${relativo}: la categoría «${ficha.categoria || ''}» no está en sitio.json (${sitio.categorias.map((c) => c.nombre).join(', ')}). Lo muestro en «Otros».`);
      categoria = sitio.categorias.find((c) => c.slug === 'otros');
      if (!categoria) {
        categoria = { nombre: 'Otros', slug: 'otros' };
        sitio.categorias.push(categoria);
      }
    }

    let portada = ordenadas[0];
    if (ficha.portada) {
      portada = ordenadas.find((f) => f.archivo.toLowerCase() === ficha.portada.toLowerCase());
      if (!portada) throw new ErrorContenido(`${relativo}/proyecto.txt: la portada «${ficha.portada}» no existe en la carpeta.`);
    }
    if (ficha.encuadre && !encuadreValido(ficha.encuadre)) {
      throw new ErrorContenido(`${relativo}/proyecto.txt: encuadre inválido «${ficha.encuadre}». Usá el formato "50% 30%".`);
    }
    const orden = ficha.orden === undefined || ficha.orden === '' ? 0 : Number(ficha.orden);
    if (!Number.isFinite(orden)) throw new ErrorContenido(`${relativo}/proyecto.txt: "orden" tiene que ser un número.`);
    if (ficha.columna && !/^(ancha|angosta)$/i.test(ficha.columna)) {
      throw new ErrorContenido(`${relativo}/proyecto.txt: "columna" puede ser ancha o angosta.`);
    }

    proyectos.push({
      slug: carpeta,
      ruta: `/proyectos/${carpeta}/`,
      nombre: ficha.nombre,
      categoria,
      ubicacion: ficha.ubicacion || '',
      ano: ficha.ano || '',
      superficie: ficha.superficie || '',
      rol: ficha.rol || '',
      estado: ficha.estado || '',
      desarrollo: ficha.desarrollo || '',
      fotografia: ficha.fotografia || '',
      parrafos: ficha.parrafos,
      orden,
      destacado: siNo(ficha.destacado, true),
      encuadre: ficha.encuadre || '',
      columna: (ficha.columna || '').toLowerCase(),
      fotos: ordenadas,
      portada,
    });
  }
  proyectos.sort((a, b) => a.orden - b.orden || ordenNatural(a.nombre, b.nombre));
  return proyectos;
}

/** contenido/redirecciones.txt → [{ desde, hacia, tipo: 'pagina' | 'foto' }] */
export async function leerRedirecciones(dirContenido) {
  const archivo = path.join(dirContenido, 'redirecciones.txt');
  if (!(await existe(archivo))) return [];
  const lineas = (await readFile(archivo, 'utf8')).replace(/\r\n?/g, '\n').split('\n');
  const lista = [];
  lineas.forEach((linea, n) => {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) return;
    const partes = limpia.split(/\s+/);
    if (partes.length !== 2 || !partes[0].startsWith('/')) {
      throw new ErrorContenido(`contenido/redirecciones.txt, línea ${n + 1}: el formato es «/ruta-vieja  /ruta-nueva»`);
    }
    const [desde, hacia] = partes;
    if (!/^\/[\w\-./%]*$/.test(desde)) throw new ErrorContenido(`contenido/redirecciones.txt, línea ${n + 1}: ruta vieja con caracteres no válidos.`);
    if (hacia.startsWith('foto:')) lista.push({ desde, hacia: hacia.slice(5), tipo: 'foto' });
    else if (/^(\/[\w\-./#]*|https:\/\/[\w.-]+(\/[\w\-./#]*)?)$/.test(hacia)) lista.push({ desde, hacia, tipo: 'pagina' });
    else throw new ErrorContenido(`contenido/redirecciones.txt, línea ${n + 1}: destino no válido «${hacia}».`);
  });
  return lista;
}
